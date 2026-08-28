import { facetMedia, facetMediaTranslation } from "@yacht-charter/db/schema/facet-media";
import { base, country, location, region } from "@yacht-charter/db/schema/geography";
import {
  listing,
  listingAmenity,
  listingCheckinRule,
  listingMedia,
  listingOneWayRule,
  listingSpecification,
} from "@yacht-charter/db/schema/listing";
import {
  listingDuplicateCandidate,
  listingSource,
  providerExtraCatalogue,
  providerExtraTranslation,
} from "@yacht-charter/db/schema/listing-source";
import { listingText } from "@yacht-charter/db/schema/listing-text";
import { operator } from "@yacht-charter/db/schema/operator";
import { providerRawPayload, providerRecord } from "@yacht-charter/db/schema/provider";
import {
  amenity,
  amenityCategory,
  builder,
  yachtCategory,
  yachtModel,
} from "@yacht-charter/db/schema/taxonomy";
import { MAX_MONEY_MINOR, newId } from "@yacht-charter/db/schema/_shared";
import { CONTENT_LOCALES, normalizedKey } from "@yacht-charter/db/search/localize";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "../registry";
import { canonicalCategoryName } from "../shared/category-groups";
import { chunked, ID_CHUNK, ROW_CHUNK } from "../shared/chunks";
import { canonicalModelName } from "../shared/model-names";
import { scoreDuplicatePair } from "./duplicate-score";
import type { DuplicatePairFacts, DuplicateSignals } from "./duplicate-score";
import type {
  CanonicalCatalogue,
  ProviderKey,
  ProviderRecordSet,
  ProviderResourceType,
} from "../types";

type CanonicalListing = CanonicalCatalogue["listings"][number];

/**
 * Listings resolved and written together.
 *
 * Must stay at or below `ID_CHUNK`: the child replaces name a whole batch in one
 * `IN (...)`, and splitting that would mean a delete running against listings whose
 * replacement rows are still two statements away.
 */
const LISTING_BATCH_SIZE = Math.min(500, ID_CHUNK);

/** Suffixed slugs tried before falling back to a stamped one. */
const SLUG_ATTEMPTS = 20;

/** Phase B input: every record ingested so far, not just this run's. */
export async function loadProviderRecordSet(
  db: Database,
  providerId: string,
): Promise<ProviderRecordSet> {
  const rows = await db
    .select({
      resourceType: providerRecord.resourceType,
      externalId: providerRecord.externalId,
      scopeKey: providerRecord.scopeKey,
      payload: providerRawPayload.payload,
    })
    .from(providerRecord)
    .innerJoin(providerRawPayload, eq(providerRawPayload.id, providerRecord.rawPayloadId))
    .where(and(eq(providerRecord.providerId, providerId), eq(providerRecord.active, true)));

  const records: ProviderRecordSet = new Map();
  for (const row of rows) {
    const bucket = records.get(row.resourceType) ?? [];
    bucket.push({
      externalId: row.externalId,
      scopeKey: row.scopeKey ?? undefined,
      payload: row.payload,
    });
    records.set(row.resourceType, bucket);
  }
  return records;
}

/* ---------------------------------------------------------------- matching */

export type MatchStatus = "unmatched" | "auto" | "confirmed" | "rejected";

export interface ExistingSourceLink {
  listingSourceId: string;
  listingId: string | null;
  matchStatus: MatchStatus;
}

export interface ListingMatchDecision {
  listingId: string | null;
  matchStatus: MatchStatus;
  /** Null means "leave the stored confidence and matchedBy alone". */
  matchConfidence: number | null;
  matchedBy: string | null;
}

/**
 * The deterministic tuple a same-provider auto-match is allowed to use. Anything
 * fuzzier, and anything crossing providers, goes to `listing_duplicate_candidate`
 * for a human instead (docs/backend-architecture.md §3).
 */
export function listingMatchKey(input: {
  externalCompanyId: string;
  externalBaseId: string;
  model: string | null;
  yearBuilt: number | null;
  name: string;
}): string {
  return [
    input.externalCompanyId,
    input.externalBaseId,
    (input.model ?? "").trim().toLowerCase(),
    input.yearBuilt ?? "",
    input.name.trim().toLowerCase(),
  ].join("|");
}

export function decideListingMatch(input: {
  providerKey: string;
  existing: ExistingSourceLink | null;
  incomingKey: string;
  /** Same-provider tuple index only. */
  candidates: Map<string, string>;
}): ListingMatchDecision {
  const existingListingId = input.existing?.listingId;
  if (existingListingId) {
    // A human verdict outranks the sync; re-stamping it would erase the review.
    if (input.existing?.matchStatus === "confirmed" || input.existing?.matchStatus === "rejected") {
      return {
        listingId: existingListingId,
        matchStatus: input.existing.matchStatus,
        matchConfidence: null,
        matchedBy: null,
      };
    }
    return {
      listingId: existingListingId,
      matchStatus: "auto",
      matchConfidence: 1,
      matchedBy: `sync:${input.providerKey}`,
    };
  }

  const candidate = input.candidates.get(input.incomingKey);
  if (candidate) {
    return {
      listingId: candidate,
      matchStatus: "auto",
      matchConfidence: 0.9,
      matchedBy: `sync:${input.providerKey}`,
    };
  }

  // New yacht: it gets its own draft listing, and nobody has verified it is not a
  // duplicate of something already in the catalogue.
  return { listingId: null, matchStatus: "unmatched", matchConfidence: null, matchedBy: null };
}

/* ------------------------------------------------------------------ writer */

export interface WriteCanonicalCatalogueOptions {
  db: Database;
  providerId: string;
  providerKey: ProviderKey;
  catalogue: CanonicalCatalogue;
  /**
   * Publish this provider's listings as they import, instead of leaving them for
   * review. Read from `provider.config.autoPublish` rather than hardcoded, so
   * trusting a provider is a data decision an operator can reverse without a
   * deploy, and so a second provider does not inherit the first one's trust.
   */
  autoPublish?: boolean;
  /**
   * Records a listing the projection could not write. Without it a failure is only a
   * counter, and a counter nobody can explain is worse than no counter.
   */
  reportListingError?: (input: { externalId: string; error: unknown }) => Promise<void>;
  now?: Date;
}

export interface CatalogueWriteSummary {
  listingsCreated: number;
  listingsUpdated: number;
  /** Drafts promoted by auto-publish, so a surprise is visible in the run counts. */
  listingsPublished: number;
  listingsSkipped: number;
  /** Listings whose own write threw; the rest of the projection still landed. */
  listingsFailed: number;
  listingsHidden: number;
  duplicateCandidates: number;
  /**
   * Provider-sourced label rows offered to `facet_media_translation`. Rows whose facet
   * already carries editorial copy for that locale are counted but left alone, so this is
   * what the sync had to say rather than what it changed.
   */
  facetTranslations: number;
  /** The same, for the priced extras dictionary. Nothing editorial writes there. */
  extraTranslations: number;
  touchedListingIds: string[];
  /**
   * Every listing whose search document this run invalidated: the ones it touched,
   * the ones the orphan sweep hid, and the drafts auto-publish promoted.
   *
   * Returned rather than rebuilt here. The rebuild used to close this function and
   * then run a second time after the price phase, because phase B necessarily
   * writes the documents before the rates exist and `bookable_from` and the card's
   * "from" figure are materialised from `listing_price_period`. Two full rebuilds
   * over eleven thousand listings to publish one correct set of documents; the
   * caller now runs it once, after the prices.
   */
  rebuildListingIds: string[];
}

const decimal = (value: number | undefined): string | null =>
  value === undefined ? null : value.toString();

export async function writeCanonicalCatalogue(
  options: WriteCanonicalCatalogueOptions,
): Promise<CatalogueWriteSummary> {
  const { db, providerId, providerKey, catalogue } = options;
  const now = options.now ?? new Date();

  const countryIds = new Map<string, string>();
  for (const item of catalogue.countries) {
    const [row] = await db
      .insert(country)
      .values({ code: item.code, name: item.name })
      .onConflictDoUpdate({ target: country.code, set: { name: sql`excluded.name` } })
      .returning({ id: country.id });
    if (row) countryIds.set(item.externalId, row.id);
  }

  const regionIds = new Map<string, string>();
  for (const item of catalogue.regions) {
    const countryId = countryIds.get(item.externalCountryId);
    // An unresolved parent degrades to a missing branch, never to a throw: one bad
    // reference must not cost the other 2999 yachts their sync.
    if (!countryId) continue;
    const id = await ensureRegion(db, countryId, item.name);
    if (id) regionIds.set(item.externalId, id);
  }

  const locationIds = new Map<string, string>();
  for (const item of catalogue.locations) {
    const regionId = regionIds.get(item.externalRegionId);
    if (!regionId) continue;
    const id = await ensureLocation(db, regionId, item.name);
    if (id) locationIds.set(item.externalId, id);
  }

  const operatorIds = new Map<string, string>();
  for (const item of catalogue.operators) {
    const [row] = await db
      .insert(operator)
      .values({
        name: item.name,
        slug: item.slug,
        country: item.country ?? null,
        // Was missing from the insert while the conflict branch read
        // `excluded.city`, so every operator's city resolved to null on both
        // paths - the update copied the value the insert never supplied.
        city: item.city ?? null,
        email: item.email ?? null,
        phone: item.phone ?? null,
        termsAndConditions: item.termsAndConditions ?? null,
      })
      .onConflictDoUpdate({
        target: operator.slug,
        set: {
          name: sql`excluded.name`,
          country: sql`excluded.country`,
          city: sql`excluded.city`,
          email: sql`excluded.email`,
          phone: sql`excluded.phone`,
          termsAndConditions: sql`excluded.terms_and_conditions`,
        },
      })
      .returning({ id: operator.id });
    if (row) operatorIds.set(item.externalId, row.id);
  }

  const baseIds = new Map<string, string>();
  for (const item of catalogue.bases) {
    const locationId = locationIds.get(item.externalLocationId);
    if (!locationId) continue;

    const id = await ensureBase(db, {
      locationId,
      name: item.name,
      lat: item.lat ?? null,
      lng: item.lng ?? null,
      email: item.email ?? null,
      phone: item.phone ?? null,
      website: item.website ?? null,
      checkInTime: item.checkInTime ?? null,
      checkOutTime: item.checkOutTime ?? null,
    });
    if (id) baseIds.set(item.externalId, id);
  }

  const builderIds = new Map<string, string>();
  for (const item of catalogue.builders) {
    const slug = item.slug ?? slugify(item.name);
    const [row] = await db
      .insert(builder)
      .values({ name: item.name, slug })
      .onConflictDoUpdate({ target: builder.slug, set: { name: sql`excluded.name` } })
      .returning({ id: builder.id });
    if (row) builderIds.set(item.externalId, row.id);
  }

  const modelIds = new Map<string, string>();
  for (const item of catalogue.models) {
    const builderId = item.externalBuilderId
      ? (builderIds.get(item.externalBuilderId) ?? null)
      : null;
    const id = await ensureModel(db, builderId, item.name);
    if (id) modelIds.set(item.externalId, id);
  }

  const categoryIds = new Map<string, string>();
  for (const item of catalogue.categories) {
    const code = item.code ?? `${providerKey}:${item.externalId}`;
    const [row] = await db
      .insert(yachtCategory)
      .values({ code, name: item.name, canonicalName: canonicalCategoryName(code) })
      .onConflictDoUpdate({
        target: yachtCategory.code,
        set: { name: sql`excluded.name`, canonicalName: sql`excluded.canonical_name` },
      })
      .returning({ id: yachtCategory.id });
    if (row) categoryIds.set(item.externalId, row.id);
  }

  const amenityCategoryIds = new Map<string, string>();
  for (const item of catalogue.amenityCategories) {
    const id = await ensureAmenityCategory(db, item.name);
    if (id) amenityCategoryIds.set(item.externalId, id);
  }

  const amenityIds = new Map<string, string>();
  for (const item of catalogue.amenities) {
    const categoryId = amenityCategoryIds.get(item.externalAmenityCategoryId);
    // amenity.amenity_category_id is NOT NULL, so an unresolved category drops the
    // amenity rather than failing the whole write.
    if (!categoryId) continue;

    const code = item.code ?? `${providerKey}:${item.externalId}`;
    const [row] = await db
      .insert(amenity)
      .values({ amenityCategoryId: categoryId, code, name: item.name })
      .onConflictDoUpdate({
        target: amenity.code,
        set: { name: sql`excluded.name`, amenityCategoryId: sql`excluded.amenity_category_id` },
      })
      .returning({ id: amenity.id });
    if (row) amenityIds.set(item.externalId, row.id);
  }

  const facetTranslations = await writeFacetTranslations(db, catalogue);
  const extraTranslations = await writeExtraTranslations(db, providerKey, catalogue);

  const yachtRecordIds = await loadYachtRecordIds(db, providerId);
  const existingLinks = await loadExistingLinks(db, providerId);
  const matchCandidates = await loadMatchCandidates(db, providerId);

  const summary: CatalogueWriteSummary = {
    listingsCreated: 0,
    listingsUpdated: 0,
    listingsPublished: 0,
    listingsSkipped: 0,
    listingsFailed: 0,
    listingsHidden: 0,
    duplicateCandidates: 0,
    facetTranslations,
    extraTranslations,
    touchedListingIds: [],
    rebuildListingIds: [],
  };

  /*
   * Listings in batches, the way the ingest walks provider records.
   *
   * One listing is sixteen statements: its own row, an upsert and a replace for
   * each of seven child tables, its source link, and the pointer back to that
   * link. Run one boat at a time that is a hundred and seventy thousand sequential
   * round trips for an eleven thousand listing account, and almost all of that time
   * is the network rather than Postgres. Batched, the same work is roughly eighteen
   * statements per five hundred listings, because every one of those steps is a set
   * operation that was being asked one row at a time.
   *
   * `INGEST_BATCH_SIZE` carries the same reasoning for phase A. Five hundred is well
   * clear of the point where batching stops paying, and low enough that a batch is
   * still a small unit of work to lose and replay.
   */
  const context: ListingWriteContext = {
    db,
    providerKey,
    amenityIds,
    autoPublish: options.autoPublish === true,
    now,
  };

  const recordWritten = (plan: ListingPlan) => {
    if (plan.isCreate) summary.listingsCreated += 1;
    else summary.listingsUpdated += 1;
    summary.touchedListingIds.push(plan.listingId);
    if (plan.listingSourceId) {
      existingLinks.set(plan.item.externalId, {
        listingSourceId: plan.listingSourceId,
        listingId: plan.listingId,
        matchStatus: plan.decision.matchStatus,
      });
    }
  };

  for (const batch of chunked(catalogue.listings, LISTING_BATCH_SIZE)) {
    const plans: ListingPlan[] = [];

    for (const item of batch) {
      const operatorId = operatorIds.get(item.externalCompanyId);
      const homeBaseId = baseIds.get(item.externalBaseId);
      const providerRecordId = yachtRecordIds.get(item.externalId);

      // A yacht we cannot anchor to an operator, a base, or its own provenance row is
      // left out entirely: the listing columns are NOT NULL for good reasons.
      if (!operatorId || !homeBaseId || !providerRecordId) {
        summary.listingsSkipped += 1;
        continue;
      }

      const modelId = item.externalModelId ? (modelIds.get(item.externalModelId) ?? null) : null;
      // The model leg is our resolved model id on both sides of the comparison: the
      // stored listing keeps no provider model id, and a name match is not deterministic.
      const incomingKey = listingMatchKey({
        externalCompanyId: item.externalCompanyId,
        externalBaseId: item.externalBaseId,
        model: modelId,
        yearBuilt: item.spec.yearBuilt,
        name: item.title,
      });

      const decision = decideListingMatch({
        providerKey,
        existing: existingLinks.get(item.externalId) ?? null,
        incomingKey,
        candidates: matchCandidates,
      });

      const columns = {
        title: item.title,
        operatorId,
        homeBaseId,
        builderId: item.externalBuilderId ? (builderIds.get(item.externalBuilderId) ?? null) : null,
        modelId,
        categoryId: item.externalCategoryId
          ? (categoryIds.get(item.externalCategoryId) ?? null)
          : null,
        defaultCurrency: item.defaultCurrency,
        crewType: item.crewType ?? null,
        securityDepositMinor: item.securityDepositMinor ?? null,
        // The currency is only meaningful alongside an amount, and a deposit that
        // named no currency of its own is priced like the rest of the yacht.
        securityDepositCurrency:
          item.securityDepositMinor === undefined
            ? null
            : (item.securityDepositCurrency ?? item.defaultCurrency),
        paymentPolicy: item.paymentPolicy ?? null,
        providerRating: decimal(item.rating),
        providerReviewCount: item.reviewCount ?? null,
        freshnessAt: now,
      };

      /*
       * The id is minted here rather than read back from the insert, so that a
       * second yacht in this same batch carrying the same match tuple resolves to
       * this listing instead of creating its own. Resolving a whole batch before
       * writing any of it is what makes that necessary: the sequential loop this
       * replaced had already inserted the first boat by the time it judged the
       * second, and `newId` exists for exactly this (see schema/_shared.ts).
       */
      const listingId = decision.listingId ?? newId("ylst");
      if (decision.listingId === null) matchCandidates.set(incomingKey, listingId);

      plans.push({
        item,
        listingId,
        isCreate: decision.listingId === null,
        rowWritten: false,
        providerRecordId,
        decision,
        columns,
        listingSourceId: null,
      });
    }

    if (plans.length === 0) continue;

    try {
      const skipped = await writeListingPlans(context, plans);
      summary.listingsSkipped += skipped.size;
      for (const plan of plans) {
        if (!skipped.has(plan)) recordWritten(plan);
      }
    } catch {
      /*
       * A statement is all or nothing, so one listing Postgres refuses takes the
       * other four hundred and ninety-nine down with it - a rate beyond its column,
       * a text field longer than its own, a not-null we mis-derived. Replayed one at
       * a time, which is what this loop did for every listing before it batched, so
       * the boat that cannot be written is the only one lost.
       *
       * Replay is safe because every step is an upsert or a whole-scope replace, and
       * because `rowWritten` records which listings the failed attempt already
       * inserted - re-inserting one of those would collide on its primary key rather
       * than on its slug, and the slug retry is not built to see that.
       *
       * The batch's own error is dropped: the replay raises it again against the one
       * listing that caused it, which is the error worth reporting.
       */
      for (const plan of plans) {
        try {
          const skipped = await writeListingPlans(context, [plan]);
          if (skipped.size > 0) summary.listingsSkipped += 1;
          else recordWritten(plan);
        } catch (error) {
          summary.listingsFailed += 1;
          await options.reportListingError?.({ externalId: plan.item.externalId, error });
        }
      }
    }
  }

  summary.duplicateCandidates = await recordDuplicateCandidates(
    db,
    providerId,
    summary.touchedListingIds,
  );

  const hidden = await hideOrphanedListings(db, providerId);
  summary.listingsHidden = hidden.length;

  // Promoted ids join the rebuild set below: a draft carried over from an earlier
  // run may not be in `touchedListingIds`, and without a doc it stays invisible.
  const published = options.autoPublish ? await publishDrafts(db, providerId) : [];
  summary.listingsPublished = published.length;

  summary.rebuildListingIds = [...new Set([...summary.touchedListingIds, ...hidden, ...published])];

  return summary;
}

/* ----------------------------------------------------------------- helpers */

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/*
 * Region, location, base, model and amenity_category are resolved by their natural
 * key rather than by a provider-scoped id, because two providers describing the
 * same marina must land on one row.
 *
 * Each insert names its conflict target and re-selects on a no-op conflict rather
 * than reading first. The read-then-insert this replaces raced: with two providers
 * importing the same geography, both missed and both inserted, and the duplicate
 * was invisible - half a fleet hanging off one `base` row and half off its twin.
 * `yacht_model` mattered most, because cross-provider duplicate detection joins on
 * `model_id` and a split model silently stops proposing merges.
 */

async function ensureRegion(db: Database, countryId: string, name: string): Promise<string | null> {
  const [created] = await db
    .insert(region)
    .values({ countryId, name })
    .onConflictDoNothing({ target: [region.countryId, region.name] })
    .returning({ id: region.id });
  if (created) return created.id;

  const [found] = await db
    .select({ id: region.id })
    .from(region)
    .where(and(eq(region.countryId, countryId), eq(region.name, name)))
    .limit(1);
  return found?.id ?? null;
}

async function ensureLocation(
  db: Database,
  regionId: string,
  name: string,
): Promise<string | null> {
  const [created] = await db
    .insert(location)
    .values({ regionId, name })
    .onConflictDoNothing({ target: [location.regionId, location.name] })
    .returning({ id: location.id });
  if (created) return created.id;

  const [found] = await db
    .select({ id: location.id })
    .from(location)
    .where(and(eq(location.regionId, regionId), eq(location.name, name)))
    .limit(1);
  return found?.id ?? null;
}

async function ensureBase(db: Database, values: typeof base.$inferInsert): Promise<string | null> {
  // Updates on conflict, unlike its siblings, because a base carries mutable
  // detail (coordinates, contact, handover times) rather than only a name.
  const [upserted] = await db
    .insert(base)
    .values(values)
    .onConflictDoUpdate({ target: [base.locationId, base.name], set: values })
    .returning({ id: base.id });
  return upserted?.id ?? null;
}

async function ensureModel(
  db: Database,
  builderId: string | null,
  name: string,
): Promise<string | null> {
  // Two constraints back this: the composite, and a partial index covering the
  // unattributed case, because Postgres treats NULL builder ids as distinct and
  // the composite alone would let those duplicate freely.
  // Updates rather than ignores the conflict so a re-sync backfills `canonical_name` onto rows
  // written before it existed; nothing else about a model row is mutable.
  const [created] = await db
    .insert(yachtModel)
    .values({ builderId, name, canonicalName: canonicalModelName(name) })
    .onConflictDoUpdate({
      ...(builderId === null
        ? { target: yachtModel.name, targetWhere: isNull(yachtModel.builderId) }
        : { target: [yachtModel.builderId, yachtModel.name] }),
      set: { canonicalName: sql`excluded.canonical_name` },
    })
    .returning({ id: yachtModel.id });
  if (created) return created.id;

  const [found] = await db
    .select({ id: yachtModel.id })
    .from(yachtModel)
    .where(
      and(
        builderId === null ? isNull(yachtModel.builderId) : eq(yachtModel.builderId, builderId),
        eq(yachtModel.name, name),
      ),
    )
    .limit(1);
  return found?.id ?? null;
}

async function ensureAmenityCategory(db: Database, name: string): Promise<string | null> {
  const [created] = await db
    .insert(amenityCategory)
    .values({ name })
    .onConflictDoNothing({ target: amenityCategory.name })
    .returning({ id: amenityCategory.id });
  if (created) return created.id;

  const [found] = await db
    .select({ id: amenityCategory.id })
    .from(amenityCategory)
    .where(eq(amenityCategory.name, name))
    .limit(1);
  return found?.id ?? null;
}

type FacetKind = (typeof facetMedia.$inferInsert)["kind"];

export type FacetLabel = {
  kind: FacetKind;
  value: string;
  translations: Record<string, string>;
};

/** A canonical reference entry the search cards name a facet after. */
type TranslatableFacet = { name: string; translations?: Record<string, string> };

/**
 * Which canonical list names each translatable facet.
 *
 * `marina`, `crew` and `sail_type` are translatable kinds with no list behind them yet:
 * bases are named after their location and the other two are derived on the listing, so
 * neither arrives here as a reference entry with a locale map attached.
 */
const FACET_LISTS: readonly [FacetKind, (catalogue: CanonicalCatalogue) => TranslatableFacet[]][] =
  [
    ["country", (catalogue) => catalogue.countries],
    ["region", (catalogue) => catalogue.regions],
    ["location", (catalogue) => catalogue.locations],
    ["category", (catalogue) => catalogue.categories],
    ["equipment", (catalogue) => catalogue.amenities],
  ];

/** Drops locales the site does not serve, and facets the provider named in one language. */
function servedLocales(
  translations: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!translations) return undefined;
  const served = Object.entries(translations).filter(([locale]) =>
    CONTENT_LOCALES.some((wanted) => wanted === locale),
  );
  return served.length === 0 ? undefined : Object.fromEntries(served);
}

export function facetLabels(catalogue: CanonicalCatalogue): FacetLabel[] {
  const byKey = new Map<string, FacetLabel>();

  for (const [kind, list] of FACET_LISTS) {
    for (const item of list(catalogue)) {
      const translations = servedLocales(item.translations);
      if (!translations) continue;

      /* The read join normalizes both sides, so "Bow thruster" and "bow-thruster" are one
         facet. Folding here too keeps the writer from inserting a second row that the join
         would then shadow with whichever one the map happened to keep. */
      const key = `${kind}:${normalizedKey(item.name)}`;
      if (!byKey.has(key)) byKey.set(key, { kind, value: item.name, translations });
    }
  }

  return [...byKey.values()];
}

/**
 * Publishes the provider's own display names into `facet_media_translation`.
 *
 * NauSYS names every reference list in eighteen languages and the projection used to keep
 * only English, which left the search cards and the yacht page in English under every
 * locale but the twelve facets somebody had translated by hand.
 *
 * Two rules make this safe to run next to that hand-written copy: facet rows are only ever
 * added, never updated, so curated imagery and sort order survive; and translation rows are
 * refreshed only where the sync wrote them, so an upstream rename lands without overwriting
 * an editor.
 */
export async function writeFacetTranslations(
  db: Database,
  catalogue: CanonicalCatalogue,
): Promise<number> {
  const labels = facetLabels(catalogue);
  if (labels.length === 0) return 0;

  for (const chunk of chunked(labels, ROW_CHUNK)) {
    await db
      .insert(facetMedia)
      .values(chunk.map((label) => ({ kind: label.kind, value: label.value })))
      .onConflictDoNothing({ target: [facetMedia.kind, facetMedia.value] });
  }

  const facetIds = new Map<string, string>();
  for (const kind of new Set(labels.map((label) => label.kind))) {
    const values = labels.filter((label) => label.kind === kind).map((label) => label.value);
    for (const chunk of chunked(values, ID_CHUNK)) {
      const rows = await db
        .select({ id: facetMedia.id, value: facetMedia.value })
        .from(facetMedia)
        .where(and(eq(facetMedia.kind, kind), inArray(facetMedia.value, chunk)));
      for (const row of rows) facetIds.set(`${kind}:${row.value}`, row.id);
    }
  }

  const rows = labels.flatMap((label) => {
    const facetMediaId = facetIds.get(`${label.kind}:${label.value}`);
    if (!facetMediaId) return [];
    return Object.entries(label.translations).map(([locale, text]) => ({
      facetMediaId,
      locale,
      label: text,
      source: "provider" as const,
    }));
  });

  for (const chunk of chunked(rows, ROW_CHUNK)) {
    await db
      .insert(facetMediaTranslation)
      .values(chunk)
      .onConflictDoUpdate({
        target: [facetMediaTranslation.facetMediaId, facetMediaTranslation.locale],
        set: { label: sql`excluded.label`, updatedAt: sql`now()` },
        setWhere: sql`${facetMediaTranslation.source} = 'provider'`,
      });
  }

  return rows.length;
}

/**
 * Publishes the provider's own names for its priced extras.
 *
 * Deduplicated to the provider's id space on the way in: extras arrive attached to listings,
 * and one fleet's boat cleaning is the same service named on every boat in it.
 *
 * A plain upsert, unlike the facet writer above. `provider_extra_translation` has no editorial
 * half to protect, so an upstream rename simply lands.
 */
export async function writeExtraTranslations(
  db: Database,
  providerKey: ProviderKey,
  catalogue: CanonicalCatalogue,
): Promise<number> {
  type Entry = {
    kind: CanonicalListing["extras"][number]["kind"];
    externalId: string;
    translations: Record<string, string>;
  };

  const byKey = new Map<string, Entry>();
  for (const item of catalogue.listings) {
    for (const extra of item.extras) {
      const translations = servedLocales(extra.translations);
      if (!translations) continue;
      byKey.set(`${extra.kind}:${extra.externalId}`, {
        kind: extra.kind,
        externalId: extra.externalId,
        translations,
      });
    }
  }

  const rows = [...byKey.values()].flatMap((entry) =>
    Object.entries(entry.translations).map(([locale, label]) => ({
      source: providerKey,
      kind: entry.kind,
      externalId: entry.externalId,
      locale,
      label,
    })),
  );
  if (rows.length === 0) return 0;

  for (const chunk of chunked(rows, ROW_CHUNK)) {
    await db
      .insert(providerExtraTranslation)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          providerExtraTranslation.source,
          providerExtraTranslation.kind,
          providerExtraTranslation.externalId,
          providerExtraTranslation.locale,
        ],
        set: { label: sql`excluded.label`, updatedAt: sql`now()` },
      });
  }

  return rows.length;
}

async function loadYachtRecordIds(db: Database, providerId: string) {
  const rows = await db
    .select({ id: providerRecord.id, externalId: providerRecord.externalId })
    .from(providerRecord)
    .where(
      and(
        eq(providerRecord.providerId, providerId),
        eq(providerRecord.resourceType, "yacht" satisfies ProviderResourceType),
      ),
    );

  return new Map(rows.map((row) => [row.externalId, row.id]));
}

async function loadExistingLinks(db: Database, providerId: string) {
  const rows = await db
    .select({
      listingSourceId: listingSource.id,
      listingId: listingSource.listingId,
      externalYachtId: listingSource.externalYachtId,
      matchStatus: listingSource.matchStatus,
    })
    .from(listingSource)
    .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
    .where(eq(providerRecord.providerId, providerId));

  return new Map<string, ExistingSourceLink>(
    rows.map((row) => [
      row.externalYachtId,
      {
        listingSourceId: row.listingSourceId,
        listingId: row.listingId,
        matchStatus: row.matchStatus,
      },
    ]),
  );
}

/** Tuple index over this provider's own sources only — matching never crosses providers. */
async function loadMatchCandidates(db: Database, providerId: string) {
  const rows = await db
    .select({
      listingId: listingSource.listingId,
      externalCompanyId: listingSource.externalCompanyId,
      externalBaseId: listingSource.externalBaseId,
      title: listing.title,
      yearBuilt: listingSpecification.yearBuilt,
      modelId: listing.modelId,
    })
    .from(listingSource)
    .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
    .innerJoin(listing, eq(listing.id, listingSource.listingId))
    .leftJoin(listingSpecification, eq(listingSpecification.listingId, listing.id))
    .where(eq(providerRecord.providerId, providerId));

  const candidates = new Map<string, string>();
  for (const row of rows) {
    if (!row.listingId || !row.externalCompanyId || !row.externalBaseId) continue;
    candidates.set(
      listingMatchKey({
        externalCompanyId: row.externalCompanyId,
        externalBaseId: row.externalBaseId,
        model: row.modelId,
        yearBuilt: row.yearBuilt,
        name: row.title,
      }),
      row.listingId,
    );
  }
  return candidates;
}

/**
 * Shared by every listing in a batch: the parts that do not vary per boat.
 */
interface ListingWriteContext {
  db: Database;
  providerKey: ProviderKey;
  amenityIds: Map<string, string>;
  autoPublish: boolean;
  now: Date;
}

/**
 * One listing resolved against the catalogue's taxonomy, ready to be written.
 *
 * Mutable in two places on purpose. `rowWritten` records that the listing row now
 * exists, so a replay after a failed batch updates it instead of inserting it a
 * second time; `listingSourceId` is what the source upsert decided, read back by
 * the caller to update its own index of links.
 */
interface ListingPlan {
  item: CanonicalListing;
  listingId: string;
  isCreate: boolean;
  rowWritten: boolean;
  providerRecordId: string;
  decision: ListingMatchDecision;
  columns: Omit<typeof listing.$inferInsert, "id" | "slug" | "status">;
  listingSourceId: string | null;
}

/**
 * Writes a batch of resolved listings, and returns the ones it did not write.
 *
 * Unwritten means skipped, not failed: a listing that could not be given a free
 * slug, or one whose row has disappeared since the run read it. A listing Postgres
 * refused is a throw, which the caller answers by replaying the batch a listing at
 * a time.
 *
 * Every step is an upsert or a whole-scope replace, so calling this again with the
 * same plans is safe - which is what makes that replay possible.
 */
async function writeListingPlans(
  ctx: ListingWriteContext,
  plans: readonly ListingPlan[],
): Promise<Set<ListingPlan>> {
  const unwritten = new Set<ListingPlan>();

  // Split before either runs: a create that lands here becomes an update on the
  // next pass, and must not also be updated on this one.
  const creates = plans.filter((plan) => plan.isCreate && !plan.rowWritten);
  const updates = plans.filter((plan) => !plan.isCreate || plan.rowWritten);

  await insertNewListings(ctx, creates, unwritten);
  await updateExistingListings(ctx, updates, unwritten);

  const written = plans.filter((plan) => !unwritten.has(plan));
  if (written.length === 0) return unwritten;

  /*
   * Two external yachts can resolve to one listing - the same match tuple twice in
   * a vendor's dump, or a second yacht matched onto the first - and the row then has
   * two candidate versions of its children. Last one wins, which is what the
   * sequential loop did by overwriting as it went; batched, writing both would leave
   * the listing holding the union of two dumps. Their source links are both kept:
   * two provider records legitimately point at one listing.
   */
  const byListing = new Map<string, ListingPlan>();
  for (const plan of written) byListing.set(plan.listingId, plan);

  await writeListingChildren(ctx, [...byListing.values()]);
  await writeListingSources(ctx, written);

  return unwritten;
}

/** Runs `write` over `rows` a statement at a time, or not at all when there are none. */
async function insertRows<T>(rows: T[], write: (chunk: T[]) => Promise<void>): Promise<void> {
  for (const chunk of chunked(rows, ROW_CHUNK)) {
    await write(chunk);
  }
}

/**
 * Two providers can both mint `bora-2019`; the first one there keeps it.
 *
 * The insert is part of the search rather than a step after it. `listing.slug` is
 * unique, so checking and then inserting is a race, and losing it used to raise
 * out of the per-listing loop and fail the entire projection over one collision.
 * Here a taken slug is just the signal to try the next suffix - and `DO NOTHING`
 * settles the batch's own collisions the same way, so two boats that project the
 * same slug behave exactly as they did when they were inserted one after the other.
 *
 * Ids are supplied rather than returned. A multi-row insert reports back only the
 * rows it wrote and in no promised order, so `RETURNING id` alone cannot say which
 * listing got which; minted up front, the returned ids are the answer to "which of
 * these landed" instead.
 */
async function insertNewListings(
  ctx: ListingWriteContext,
  creates: readonly ListingPlan[],
  unwritten: Set<ListingPlan>,
): Promise<void> {
  if (creates.length === 0) return;

  // Draft unless the provider is explicitly trusted: thousands of unreviewed
  // yachts must not go live on the first run of a new connector.
  const status: (typeof listing.$inferInsert)["status"] = ctx.autoPublish ? "published" : "draft";
  let pending = [...creates];

  for (let attempt = 0; attempt <= SLUG_ATTEMPTS && pending.length > 0; attempt += 1) {
    const values = pending.map((plan, index) => ({
      ...plan.columns,
      id: plan.listingId,
      slug: slugAttempt(plan.item.slug, attempt, index),
      status,
    }));

    const landed = new Set<string>();
    for (const chunk of chunked(values, ROW_CHUNK)) {
      const rows = await ctx.db
        .insert(listing)
        .values(chunk)
        .onConflictDoNothing({ target: listing.slug })
        .returning({ id: listing.id });
      for (const row of rows) landed.add(row.id);
    }

    for (const plan of pending) {
      if (landed.has(plan.listingId)) plan.rowWritten = true;
    }
    pending = pending.filter((plan) => !plan.rowWritten);
  }

  // Twenty suffixes and a timestamped one all taken is no longer a slug problem.
  for (const plan of pending) unwritten.add(plan);
}

/** `seed`, `seed-2` … `seed-20`, then one stamped attempt that cannot collide. */
function slugAttempt(candidate: string, attempt: number, index: number): string {
  const seed = candidate === "" ? "listing" : candidate;
  if (attempt === 0) return seed;
  if (attempt < SLUG_ATTEMPTS) return `${seed}-${attempt + 1}`;
  return `${seed}-${Date.now()}-${index}`;
}

/**
 * The listing rows that already exist, restated from their plans.
 *
 * An `ON CONFLICT (id) DO UPDATE` rather than an `UPDATE ... FROM (VALUES ...)`,
 * which is why it first reads back each row's slug and status: those two are NOT
 * NULL and this run has no opinion on either, so they are carried through the
 * insert untouched. That read is one statement per batch, and it buys a write with
 * no positional contract between a column list and a row of parameters - the kind
 * where two text columns swapped round is silent.
 *
 * A listing whose id has disappeared since the run started is left alone rather
 * than re-created from a stale plan. The plain `UPDATE` this replaced was a no-op
 * against a missing row too.
 */
async function updateExistingListings(
  ctx: ListingWriteContext,
  updates: readonly ListingPlan[],
  unwritten: Set<ListingPlan>,
): Promise<void> {
  if (updates.length === 0) return;

  const stored = await ctx.db
    .select({ id: listing.id, slug: listing.slug, status: listing.status })
    .from(listing)
    .where(
      inArray(
        listing.id,
        updates.map((plan) => plan.listingId),
      ),
    );

  const identities = new Map(stored.map((row) => [row.id, row]));

  /*
   * Keyed by id, because two external yachts can already be linked to one listing -
   * the second run over a vendor that ships the same match tuple twice - and
   * Postgres refuses an `ON CONFLICT DO UPDATE` that would touch one row twice in a
   * single statement. Last one wins, which is what the sequential loop did by
   * issuing the two updates in order. Both yachts still get their own source link.
   */
  const values = new Map<string, typeof listing.$inferInsert>();
  for (const plan of updates) {
    const identity = identities.get(plan.listingId);
    if (!identity) {
      unwritten.add(plan);
      continue;
    }
    values.set(plan.listingId, {
      ...plan.columns,
      id: plan.listingId,
      slug: identity.slug,
      status: identity.status,
    });
  }
  if (values.size === 0) return;

  for (const chunk of chunked([...values.values()], ROW_CHUNK)) {
    await ctx.db
      .insert(listing)
      .values(chunk)
      .onConflictDoUpdate({
        target: listing.id,
        set: {
          title: sql`excluded.title`,
          operatorId: sql`excluded.operator_id`,
          homeBaseId: sql`excluded.home_base_id`,
          builderId: sql`excluded.builder_id`,
          modelId: sql`excluded.model_id`,
          categoryId: sql`excluded.category_id`,
          defaultCurrency: sql`excluded.default_currency`,
          crewType: sql`excluded.crew_type`,
          securityDepositMinor: sql`excluded.security_deposit_minor`,
          securityDepositCurrency: sql`excluded.security_deposit_currency`,
          paymentPolicy: sql`excluded.payment_policy`,
          providerRating: sql`excluded.provider_rating`,
          providerReviewCount: sql`excluded.provider_review_count`,
          freshnessAt: sql`excluded.freshness_at`,
          // Drizzle's `$onUpdate` fires for `.update()`, not for a conflict clause.
          updatedAt: sql`now()`,
        },
      });
  }
}

/**
 * The provider's source link for each listing, and the pointer back to it.
 *
 * Arbitrated on `provider_record_id`, which carries its own unique index, so the
 * upsert covers a new link and an existing one in one statement and this does not
 * need to know which it is. `listing.primary_source_id` is a second statement
 * rather than a column of the first only because the id it points at is the one
 * this insert decides.
 */
async function writeListingSources(
  ctx: ListingWriteContext,
  plans: readonly ListingPlan[],
): Promise<void> {
  // A provider record links to exactly one source row, so a repeated record in one
  // batch is one write, last one winning - what the sequential loop did anyway.
  const byRecord = new Map<string, ListingPlan>();
  for (const plan of plans) byRecord.set(plan.providerRecordId, plan);

  const values = [...byRecord.values()].map((plan) => ({
    id: newId("lsrc"),
    listingId: plan.listingId,
    providerRecordId: plan.providerRecordId,
    externalYachtId: plan.item.externalId,
    externalCompanyId: plan.item.externalCompanyId,
    externalBaseId: plan.item.externalBaseId,
    matchStatus: plan.decision.matchStatus,
    matchConfidence: plan.decision.matchedBy
      ? (plan.decision.matchConfidence?.toFixed(4) ?? null)
      : null,
    matchedBy: plan.decision.matchedBy,
    matchedAt: plan.decision.matchedBy ? ctx.now : null,
  }));

  const sourceIds = new Map<string, string>();
  for (const chunk of chunked(values, ROW_CHUNK)) {
    const written = await ctx.db
      .insert(listingSource)
      .values(chunk)
      .onConflictDoUpdate({
        target: listingSource.providerRecordId,
        set: {
          listingId: sql`excluded.listing_id`,
          externalCompanyId: sql`excluded.external_company_id`,
          externalBaseId: sql`excluded.external_base_id`,
          matchStatus: sql`excluded.match_status`,
          /*
           * An unmatched decision leaves the previous match provenance untouched
           * rather than blanking it, so those three columns are only written
           * together. A null `matched_by` is the signal that this run reached no
           * verdict of its own, which is also how the row arrives here.
           */
          matchConfidence: sql`case when excluded.matched_by is null then ${listingSource.matchConfidence} else excluded.match_confidence end`,
          matchedBy: sql`case when excluded.matched_by is null then ${listingSource.matchedBy} else excluded.matched_by end`,
          matchedAt: sql`case when excluded.matched_by is null then ${listingSource.matchedAt} else excluded.matched_at end`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: listingSource.id, providerRecordId: listingSource.providerRecordId });

    for (const row of written) sourceIds.set(row.providerRecordId, row.id);
  }

  // Deduplicated because `UPDATE ... FROM` picks arbitrarily among rows that match
  // the same target, and two external yachts can share one listing.
  const pointers = new Map<string, string>();
  for (const plan of plans) {
    const sourceId = sourceIds.get(plan.providerRecordId);
    if (!sourceId) continue;
    plan.listingSourceId = sourceId;
    pointers.set(plan.listingId, sourceId);
  }
  if (pointers.size === 0) return;

  const rows = sql.join(
    [...pointers].map(([listingId, sourceId]) => sql`(${listingId}, ${sourceId})`),
    sql`, `,
  );

  await ctx.db.execute(sql`
    update ${listing}
       set primary_source_id = v.source_id, updated_at = now()
      from (values ${rows}) as v(listing_id, source_id)
     where ${listing.id} = v.listing_id
  `);
}

/**
 * Provider-owned child rows are replaced wholesale rather than diffed: the dump is
 * the complete truth for this listing, and a diff would leave rows the provider has
 * dropped behind forever.
 *
 * One delete and one insert per table for the whole batch. The delete can name the
 * batch's listings in a single `IN (...)` because `LISTING_BATCH_SIZE` is held
 * below `ID_CHUNK`; the inserts still chunk, because five hundred listings is tens
 * of thousands of media rows.
 */
async function writeListingChildren(
  ctx: ListingWriteContext,
  plans: readonly ListingPlan[],
): Promise<void> {
  const { db, providerKey } = ctx;
  const listingIds = plans.map((plan) => plan.listingId);

  await insertRows(
    plans.map(({ listingId, item }) => ({
      listingId,
      lengthM: decimal(item.spec.lengthM),
      beamM: decimal(item.spec.beamM),
      draftM: decimal(item.spec.draftM),
      yearBuilt: item.spec.yearBuilt,
      cabins: item.spec.cabins,
      berths: item.spec.berths,
      heads: item.spec.heads,
      showers: item.spec.showers ?? null,
      engines: item.spec.engines ?? null,
      fuelCapacity: item.spec.fuelCapacity ?? null,
      waterCapacity: item.spec.waterCapacity ?? null,
      sailType: item.spec.sailType ?? null,
    })),
    async (chunk) => {
      await db
        .insert(listingSpecification)
        .values(chunk)
        .onConflictDoUpdate({
          target: listingSpecification.listingId,
          set: {
            lengthM: sql`excluded.length_m`,
            beamM: sql`excluded.beam_m`,
            draftM: sql`excluded.draft_m`,
            yearBuilt: sql`excluded.year_built`,
            cabins: sql`excluded.cabins`,
            berths: sql`excluded.berths`,
            heads: sql`excluded.heads`,
            showers: sql`excluded.showers`,
            engines: sql`excluded.engines`,
            fuelCapacity: sql`excluded.fuel_capacity`,
            waterCapacity: sql`excluded.water_capacity`,
            sailType: sql`excluded.sail_type`,
          },
        });
    },
  );

  // Scoped by source so a second provider's media on a merged listing survives.
  await db
    .delete(listingMedia)
    .where(and(inArray(listingMedia.listingId, listingIds), eq(listingMedia.source, providerKey)));
  await insertRows(
    plans.flatMap(({ listingId, item }) =>
      item.media.map((media) => ({
        listingId,
        source: providerKey,
        // Verbatim vendor URL, no Cloudinary id: we have no confirmed rights to
        // copy or re-host provider media yet (Q-MEDIA).
        externalUrl: media.externalUrl,
        role: media.role,
        sortOrder: media.sortOrder,
      })),
    ),
    async (chunk) => {
      await db.insert(listingMedia).values(chunk);
    },
  );

  await db.delete(listingText).where(inArray(listingText.listingId, listingIds));
  await insertRows(
    plans.flatMap(({ listingId, item }) =>
      item.texts.map((text) => ({
        listingId,
        kind: text.kind,
        locale: text.locale,
        value: text.value,
      })),
    ),
    async (chunk) => {
      await db.insert(listingText).values(chunk);
    },
  );

  await db.delete(listingAmenity).where(inArray(listingAmenity.listingId, listingIds));
  await insertRows(
    plans.flatMap(({ listingId, item }) =>
      [
        ...new Set(
          item.amenities
            .map((externalId) => ctx.amenityIds.get(externalId))
            .filter((amenityId): amenityId is string => Boolean(amenityId)),
        ),
      ].map((amenityId) => ({ listingId, amenityId })),
    ),
    async (chunk) => {
      await db.insert(listingAmenity).values(chunk);
    },
  );

  // Scoped by source for the same reason media is: a merged listing must keep the
  // other provider's extras when this one resyncs.
  await db
    .delete(providerExtraCatalogue)
    .where(
      and(
        inArray(providerExtraCatalogue.listingId, listingIds),
        eq(providerExtraCatalogue.source, providerKey),
      ),
    );
  await insertRows(
    plans.flatMap(({ listingId, item }) =>
      priceableExtras(listingId, item).map((extra) => ({
        listingId,
        source: providerKey,
        kind: extra.kind,
        externalId: extra.externalId,
        name: extra.name,
        obligatory: extra.obligatory,
        crewRole: extra.crewRole ?? null,
        priceMinor: extra.priceMinor,
        priceCurrency: extra.priceCurrency,
        priceMeasure: extra.priceMeasure ?? null,
        calculationType: extra.calculationType ?? null,
        payableInBase: extra.payableInBase ?? null,
        seasonStart: extra.seasonStart ?? null,
        seasonEnd: extra.seasonEnd ?? null,
        validNightsFrom: extra.validNightsFrom ?? null,
        validNightsTo: extra.validNightsTo ?? null,
        oneWayOnly: extra.oneWayOnly ?? false,
        onRequestOnly: extra.onRequestOnly,
        externalSeasonId: extra.externalSeasonId ?? null,
        externalBaseId: extra.externalBaseId ?? null,
      })),
    ),
    async (chunk) => {
      await db.insert(providerExtraCatalogue).values(chunk);
    },
  );

  await db.delete(listingCheckinRule).where(inArray(listingCheckinRule.listingId, listingIds));
  await insertRows(
    plans.flatMap(({ listingId, item }) =>
      item.checkinRules.map((rule) => ({
        listingId,
        checkinWeekday: rule.checkinWeekday ?? null,
        checkoutWeekday: rule.checkoutWeekday ?? null,
        minNights: rule.minNights ?? null,
        maxNights: rule.maxNights ?? null,
      })),
    ),
    async (chunk) => {
      await db.insert(listingCheckinRule).values(chunk);
    },
  );

  await db.delete(listingOneWayRule).where(inArray(listingOneWayRule.listingId, listingIds));
  await insertRows(
    plans.flatMap(({ listingId, item }) =>
      item.oneWayRules.map((rule) => ({
        listingId,
        startDate: rule.startDate,
        endDate: rule.endDate,
        isOneWay: rule.isOneWay,
      })),
    ),
    async (chunk) => {
      await db.insert(listingOneWayRule).values(chunk);
    },
  );
}

/**
 * An extra priced beyond what the column holds is dropped, not thrown.
 *
 * `provider_extra_catalogue.price_minor` is an integer like every money column
 * here, and the insert covers a whole batch of listings, so a single over-range
 * extra would cost every one of them its extras and send the batch through the
 * per-listing replay to find out why. Losing one extra from one boat is the smaller
 * loss by a very wide margin.
 */
function priceableExtras(listingId: string, item: CanonicalListing) {
  const extras = item.extras.filter(
    (extra) =>
      Number.isSafeInteger(extra.priceMinor) && Math.abs(extra.priceMinor) <= MAX_MONEY_MINOR,
  );
  if (extras.length !== item.extras.length) {
    console.warn(
      `[catalogue] listing ${listingId}: dropped ${item.extras.length - extras.length} extra(s) priced beyond price_minor`,
    );
  }
  return extras;
}

/**
 * Cross-provider look-alikes are never merged, only proposed: same model, same
 * build year, different provider. A human decides in `listing_duplicate_candidate`.
 *
 * That gate is weak on its own — two sister ships in two countries pass it — so
 * `scoreDuplicatePair` weighs what else the two sides agree on and the queue is
 * ordered and filtered by the result. Pairs this run touches that are still
 * pending are re-scored, so a change to the weights reaches the backlog on the
 * next full sync rather than only the pairs proposed after it.
 */
async function recordDuplicateCandidates(
  db: Database,
  providerId: string,
  listingIds: string[],
): Promise<number> {
  if (listingIds.length === 0) return 0;

  const pairs = await selectDuplicatePairs(db, providerId, listingIds);
  if (pairs.length === 0) return 0;

  const scored = pairs.map((row) => ({ row, ...scoreDuplicatePair(pairFacts(row)) }));
  const fresh = scored.filter(({ row }) => row.candidateId === null);

  await insertRows(
    fresh.map(({ row, confidence, signals }) => ({
      sourceAId: row.sourceAId,
      sourceBId: row.sourceBId,
      signals,
      confidence: confidence.toFixed(4),
      decision: "pending" as const,
    })),
    async (chunk) => {
      // The pair index is orientation-independent; two providers syncing at once both
      // pass the "no candidate yet" read above and one of them arrives second.
      await db.insert(listingDuplicateCandidate).values(chunk).onConflictDoNothing();
    },
  );

  await rescorePendingCandidates(
    db,
    scored.filter(({ row }) => row.candidateId !== null && row.decision === "pending"),
  );

  return fresh.length;
}

type DuplicatePairRow = {
  sourceAId: string;
  sourceBId: string;
  /** Null when the pair has not been proposed yet, which is what makes it new. */
  candidateId: string | null;
  decision: string | null;
  modelName: string | null;
  titleA: string;
  titleB: string;
  lengthA: string | null;
  lengthB: string | null;
  cabinsA: number | null;
  cabinsB: number | null;
  berthsA: number | null;
  berthsB: number | null;
  headsA: number | null;
  headsB: number | null;
  baseA: string | null;
  baseB: string | null;
  locationA: string | null;
  locationB: string | null;
  latA: number | null;
  latB: number | null;
  lngA: number | null;
  lngB: number | null;
  builderA: string | null;
  builderB: string | null;
  operatorA: string | null;
  operatorB: string | null;
};

function pairFacts(row: DuplicatePairRow): DuplicatePairFacts {
  return {
    modelName: row.modelName,
    a: {
      title: row.titleA,
      lengthM: row.lengthA === null ? null : Number(row.lengthA),
      cabins: row.cabinsA,
      berths: row.berthsA,
      heads: row.headsA,
      homeBaseId: row.baseA,
      locationId: row.locationA,
      lat: row.latA,
      lng: row.lngA,
      builderId: row.builderA,
      operatorName: row.operatorA,
    },
    b: {
      title: row.titleB,
      lengthM: row.lengthB === null ? null : Number(row.lengthB),
      cabins: row.cabinsB,
      berths: row.berthsB,
      heads: row.headsB,
      homeBaseId: row.baseB,
      locationId: row.locationB,
      lat: row.latB,
      lng: row.lngB,
      builderId: row.builderB,
      operatorName: row.operatorB,
    },
  };
}

/**
 * Every cross-provider pair this run's listings take part in, with both sides' facts
 * and whichever candidate row already stands for it. One read serves both the pairs
 * that are new and the ones only being re-scored.
 */
async function selectDuplicatePairs(
  db: Database,
  providerId: string,
  listingIds: string[],
): Promise<DuplicatePairRow[]> {
  const rows = await db.execute<DuplicatePairRow>(sql`
    select
      a.id as "sourceAId",
      b.id as "sourceBId",
      d.id as "candidateId",
      d.decision::text as "decision",
      m.name as "modelName",
      la.title as "titleA",
      lb.title as "titleB",
      sa.length_m as "lengthA",
      sb.length_m as "lengthB",
      sa.cabins as "cabinsA",
      sb.cabins as "cabinsB",
      sa.berths as "berthsA",
      sb.berths as "berthsB",
      sa.heads as "headsA",
      sb.heads as "headsB",
      la.home_base_id as "baseA",
      lb.home_base_id as "baseB",
      bsa.location_id as "locationA",
      bsb.location_id as "locationB",
      bsa.lat as "latA",
      bsb.lat as "latB",
      bsa.lng as "lngA",
      bsb.lng as "lngB",
      la.builder_id as "builderA",
      lb.builder_id as "builderB",
      oa.name as "operatorA",
      ob.name as "operatorB"
    from listing_source a
    join provider_record pra on pra.id = a.provider_record_id
    join listing la on la.id = a.listing_id
    join listing_specification sa on sa.listing_id = la.id
    join listing lb on lb.model_id = la.model_id and lb.id <> la.id
    join listing_specification sb on sb.listing_id = lb.id and sb.year_built = sa.year_built
    join listing_source b on b.listing_id = lb.id
    join provider_record prb on prb.id = b.provider_record_id
    left join yacht_model m on m.id = la.model_id
    left join base bsa on bsa.id = la.home_base_id
    left join base bsb on bsb.id = lb.home_base_id
    left join operator oa on oa.id = la.operator_id
    left join operator ob on ob.id = lb.operator_id
    left join listing_duplicate_candidate d
      on least(d.source_a_id, d.source_b_id) = least(a.id, b.id)
     and greatest(d.source_a_id, d.source_b_id) = greatest(a.id, b.id)
    where pra.provider_id = ${providerId}
      and prb.provider_id <> ${providerId}
      and la.model_id is not null
      and sa.year_built is not null
      and la.id in (${sql.join(
        listingIds.map((id) => sql`${id}`),
        sql`, `,
      )})
  `);

  return rows.rows;
}

/**
 * A reviewed pair is never touched: the verdict is the record, and re-scoring it
 * would rewrite the evidence someone already decided on.
 */
async function rescorePendingCandidates(
  db: Database,
  scored: { row: DuplicatePairRow; confidence: number; signals: DuplicateSignals }[],
): Promise<void> {
  for (const chunk of chunked(scored, ROW_CHUNK)) {
    const values = chunk.map(
      ({ row, confidence, signals }) =>
        sql`(${row.candidateId}, ${confidence.toFixed(4)}::numeric, ${JSON.stringify(signals)}::jsonb)`,
    );

    await db.execute(sql`
      update listing_duplicate_candidate as d
      set confidence = v.confidence, signals = v.signals, updated_at = now()
      from (values ${sql.join(values, sql`, `)}) as v(id, confidence, signals)
      where d.id = v.id
        and d.decision = 'pending'
        and (d.confidence is distinct from v.confidence or d.signals is distinct from v.signals)
    `);
  }
}

/**
 * Promotes this provider's drafts once it is trusted.
 *
 * Deliberately `draft` only. A `hidden` listing was withdrawn by a person or by
 * the orphan sweep above, and auto-publish must not overrule either of them: the
 * flag says "new inventory needs no review", not "ignore every decision anyone
 * made". It also runs after the sweep, so a listing hidden in this same run is
 * not resurrected a few lines later.
 *
 * Existing drafts are included, not just this run's inserts, so turning the flag
 * on releases the backlog that accumulated while it was off.
 */
async function publishDrafts(db: Database, providerId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    update listing
    set status = 'published', updated_at = now()
    where listing.status = 'draft'
      and exists (
        select 1
        from listing_source ls
        join provider_record pr on pr.id = ls.provider_record_id
        where ls.listing_id = listing.id and pr.provider_id = ${providerId} and pr.active
      )
    returning listing.id
  `);
  return rows.rows.map((row) => row.id);
}

/**
 * A listing whose every source has been deactivated is hidden, never deleted, and
 * never re-published automatically: coming back into a dump restores the provider
 * record, but re-listing it is a human decision.
 */
async function hideOrphanedListings(db: Database, providerId: string): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    update listing
    set status = 'hidden', updated_at = now()
    where listing.status <> 'hidden'
      and exists (
        select 1
        from listing_source ls
        join provider_record pr on pr.id = ls.provider_record_id
        where ls.listing_id = listing.id and pr.provider_id = ${providerId}
      )
      and not exists (
        select 1
        from listing_source ls2
        join provider_record pr2 on pr2.id = ls2.provider_record_id
        where ls2.listing_id = listing.id and pr2.active
      )
    returning listing.id as id
  `);

  return rows.rows.map((row) => row.id);
}
