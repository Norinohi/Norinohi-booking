import { facetMedia, facetMediaTranslation } from "@yacht-charter/db/schema/facet-media";
import { base, country, location, region } from "@yacht-charter/db/schema/geography";
import {
  listing,
  listingAmenity,
  listingCheckinRule,
  listingMedia,
  listingOneWayRule,
} from "@yacht-charter/db/schema/listing";
import {
  listingDuplicateCandidate,
  listingSource,
  providerExtraCatalogue,
  providerExtraTranslation,
} from "@yacht-charter/db/schema/listing-source";
import { listingOffer, listingOfferSpecification } from "@yacht-charter/db/schema/listing-offer";
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
import { resolveCanonicalListings } from "./canonical-listing-writer";
import { scoreDuplicatePair, worthReviewing, yachtNameKey } from "./duplicate-score";
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
 * Which listing a provider's yacht record belongs to.
 *
 * A vendor's own id space is the identity, and nothing else is allowed to be. This used to
 * also auto-match a new record onto an existing listing when `company|base|model|year|name`
 * agreed, on the theory that a vendor re-issuing an id should not fork the boat. Booking
 * Manager publishes no per-hull name — its `name` is the product line, "Moorings 4200/3/3
 * Exclusive" — so that tuple is identical across a whole fleet of sister ships at one base,
 * and the rule fused them: 172 listings ended up holding 486 records, and because prices and
 * calendars are keyed by listing, 314 boats were overwritten into invisibility.
 *
 * So there is no fuzzy same-provider matching left. A record we have not seen before gets its
 * own listing, and anything that really is one boat twice is a duplicate for a human to
 * confirm, which is where every cross-provider pair already goes.
 */
export function decideListingMatch(input: {
  providerKey: string;
  existing: ExistingSourceLink | null;
}): ListingMatchDecision {
  /*
   * An already-linked source keeps whatever status it has, and this run records no
   * verdict of its own. Seeing the same yacht a second time is not a match decision:
   * stamping it `auto` at confidence 1 made every source in the catalogue read as a
   * high-confidence automatic match after two nights, so the column could no longer
   * distinguish "linked by a tuple match" from "seen again", and any precision figure
   * measured from it was meaningless. The verdict that put the link there is the
   * record, whether a human or the matcher made it.
   */
  const existingListingId = input.existing?.listingId;
  if (existingListingId && input.existing) {
    return {
      listingId: existingListingId,
      matchStatus: input.existing.matchStatus,
      matchConfidence: null,
      matchedBy: null,
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
  /* Kept beside the ids because `yachtNameKey` strips the model out of the title by name. */
  const modelNames = new Map<string, string>();
  for (const item of catalogue.models) {
    const builderId = item.externalBuilderId
      ? (builderIds.get(item.externalBuilderId) ?? null)
      : null;
    const id = await ensureModel(db, builderId, item.name);
    if (id) {
      modelIds.set(item.externalId, id);
      modelNames.set(item.externalId, item.name);
    }
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
    providerId,
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

      const decision = decideListingMatch({
        providerKey,
        existing: existingLinks.get(item.externalId) ?? null,
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
       * Minted here rather than read back from the insert, because the whole batch is
       * resolved before any of it is written and the plans have to name the listing they
       * will land on. `newId` exists for exactly this (see schema/_shared.ts).
       */
      const listingId = decision.listingId ?? newId("ylst");

      plans.push({
        item,
        listingId,
        isCreate: decision.listingId === null,
        rowWritten: false,
        providerRecordId,
        decision,
        columns,
        nameKey: yachtNameKey(
          item.title,
          item.externalModelId ? (modelNames.get(item.externalModelId) ?? null) : null,
        ),
        listingSourceId: null,
        listingOfferId: null,
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

  /*
   * The listings themselves are written here and nowhere else. Each provider writes only its
   * own offer, and this composes `listing` and `listing_specification` from all of them by the
   * precedence in docs/backend-architecture.md §3.4 — which is what stopped two syncs
   * overwriting each other's title and cabin count every night.
   */
  await resolveCanonicalListings(db, summary.touchedListingIds);

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

/**
 * Shared by every listing in a batch: the parts that do not vary per boat.
 */
interface ListingWriteContext {
  db: Database;
  providerId: string;
  providerKey: ProviderKey;
  amenityIds: Map<string, string>;
  autoPublish: boolean;
  now: Date;
}

/**
 * One listing resolved against the catalogue's taxonomy, ready to be written.
 *
 * Mutable in three places on purpose. `rowWritten` records that the listing row now
 * exists, so a replay after a failed batch updates it instead of inserting it a
 * second time; `listingSourceId` and `listingOfferId` are what the source and offer
 * upserts decided, read back by the caller and by the child writes.
 */
interface ListingPlan {
  item: CanonicalListing;
  listingId: string;
  isCreate: boolean;
  rowWritten: boolean;
  providerRecordId: string;
  decision: ListingMatchDecision;
  /** This provider's own reading of the boat. Written to the offer, never to the listing. */
  columns: Omit<typeof listing.$inferInsert, "id" | "slug" | "status">;
  /** The boat's name as the duplicate matcher folds it, for the name+base gate. */
  nameKey: string | null;
  listingSourceId: string | null;
  listingOfferId: string | null;
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
  await dropVanishedListings(ctx, updates, unwritten);

  const written = plans.filter((plan) => !unwritten.has(plan));
  if (written.length === 0) return unwritten;

  /*
   * Sources first, then the offers keyed on them, then the children keyed on the offers.
   * No collapsing by listing any more: children belong to an offer, so two records sharing
   * a listing each write their own set instead of one silently winning.
   */
  await writeListingSources(ctx, written);
  await writeListingOffers(ctx, written);
  await writeListingChildren(ctx, written);

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
 * Drops plans whose listing has disappeared since the run read it.
 *
 * All that is left of the old `updateExistingListings`. This no longer writes `listing` at
 * all — `resolveCanonicalListings` composes it from the offers once the batch has landed —
 * but the existence check has to stay, because `listing_offer.listing_id` is a foreign key
 * and a plan pointing at a deleted listing would take its whole batch down.
 */
async function dropVanishedListings(
  ctx: ListingWriteContext,
  updates: readonly ListingPlan[],
  unwritten: Set<ListingPlan>,
): Promise<void> {
  if (updates.length === 0) return;

  const stored = await ctx.db
    .select({ id: listing.id })
    .from(listing)
    .where(
      inArray(
        listing.id,
        updates.map((plan) => plan.listingId),
      ),
    );

  const present = new Set(stored.map((row) => row.id));
  for (const plan of updates) {
    if (!present.has(plan.listingId)) unwritten.add(plan);
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

  /*
   * Claimed, not re-pointed. This used to run unconditionally, so on a listing both
   * vendors feed, every catalogue run moved the pointer to whichever provider had just
   * finished — and `provider-routing.ts` reads it as the merge decision a human made.
   * It is only written where nothing holds it, or where what holds it has gone: a
   * source that was deleted, detached from this listing, or whose provider record went
   * inactive. That leaves a live pointer alone and still repairs a dead one.
   */
  await ctx.db.execute(sql`
    update ${listing}
       set primary_source_id = v.source_id, updated_at = now()
      from (values ${rows}) as v(listing_id, source_id)
     where ${listing.id} = v.listing_id
       and (
         ${listing.primarySourceId} is null
         or not exists (
           select 1
           from listing_source held
           join provider_record held_record on held_record.id = held.provider_record_id
           where held.id = ${listing.primarySourceId}
             and held.listing_id = ${listing.id}
             and held_record.active
         )
       )
  `);
}
/**
 * One `listing_offer` per source, carrying this provider's own reading of the boat.
 *
 * Everything the sync knows about a yacht lands here rather than on `listing`, and
 * `resolveCanonicalListings` composes the listing from every provider's offer afterwards.
 * That is what ended the nightly overwrite: two vendors can both write in full and neither
 * erases the other, because they are writing different rows.
 *
 * Arbitrated on `listing_source_id`, which is unique, so this covers a new offer and an
 * existing one in one statement. `listing_id` is in the `set` because a merge moves an offer
 * between listings and the next sync must not drag it back.
 */
async function writeListingOffers(
  ctx: ListingWriteContext,
  plans: readonly ListingPlan[],
): Promise<void> {
  const withSource = plans.filter(
    (plan): plan is ListingPlan & { listingSourceId: string } => plan.listingSourceId !== null,
  );
  if (withSource.length === 0) return;

  const values = withSource.map((plan) => ({
    id: newId("loff"),
    listingId: plan.listingId,
    listingSourceId: plan.listingSourceId,
    providerId: ctx.providerId,
    status: "active" as const,
    ...plan.columns,
    nameKey: plan.nameKey,
    catalogueSyncedAt: ctx.now,
  }));

  const offerIds = new Map<string, string>();
  for (const chunk of chunked(values, ROW_CHUNK)) {
    const written = await ctx.db
      .insert(listingOffer)
      .values(chunk)
      .onConflictDoUpdate({
        target: listingOffer.listingSourceId,
        set: {
          listingId: sql`excluded.listing_id`,
          status: sql`excluded.status`,
          title: sql`excluded.title`,
          operatorId: sql`excluded.operator_id`,
          homeBaseId: sql`excluded.home_base_id`,
          builderId: sql`excluded.builder_id`,
          modelId: sql`excluded.model_id`,
          categoryId: sql`excluded.category_id`,
          petsAllowed: sql`excluded.pets_allowed`,
          defaultCurrency: sql`excluded.default_currency`,
          crewType: sql`excluded.crew_type`,
          securityDepositMinor: sql`excluded.security_deposit_minor`,
          securityDepositCurrency: sql`excluded.security_deposit_currency`,
          depositInsuranceIncluded: sql`excluded.deposit_insurance_included`,
          providerRating: sql`excluded.provider_rating`,
          providerReviewCount: sql`excluded.provider_review_count`,
          nameKey: sql`excluded.name_key`,
          catalogueSyncedAt: sql`excluded.catalogue_synced_at`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: listingOffer.id, listingSourceId: listingOffer.listingSourceId });

    for (const row of written) offerIds.set(row.listingSourceId, row.id);
  }

  for (const plan of withSource) {
    plan.listingOfferId = offerIds.get(plan.listingSourceId) ?? null;
  }

  const specs = withSource.flatMap((plan) =>
    plan.listingOfferId === null
      ? []
      : [
          {
            id: newId("lospec"),
            listingOfferId: plan.listingOfferId,
            lengthM: decimal(plan.item.spec.lengthM),
            beamM: decimal(plan.item.spec.beamM),
            draftM: decimal(plan.item.spec.draftM),
            yearBuilt: plan.item.spec.yearBuilt ?? null,
            cabins: plan.item.spec.cabins ?? null,
            berths: plan.item.spec.berths ?? null,
            heads: plan.item.spec.heads ?? null,
            showers: plan.item.spec.showers ?? null,
            engines: plan.item.spec.engines ?? null,
            fuelCapacity: plan.item.spec.fuelCapacity ?? null,
            waterCapacity: plan.item.spec.waterCapacity ?? null,
            sailType: plan.item.spec.sailType ?? null,
          },
        ],
  );

  for (const chunk of chunked(specs, ROW_CHUNK)) {
    await ctx.db
      .insert(listingOfferSpecification)
      .values(chunk)
      .onConflictDoUpdate({
        target: listingOfferSpecification.listingOfferId,
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
          updatedAt: sql`now()`,
        },
      });
  }
}

/**
 * Provider-owned child rows are replaced wholesale rather than diffed: the dump is
 * the complete truth for this offer, and a diff would leave rows the provider has
 * dropped behind forever.
 *
 * Every delete is scoped to the offers being rewritten, never to their listings. That is the
 * whole change: these tables used to be cleared per listing, so on a yacht both vendors sell
 * each nightly run wiped the other's descriptions, equipment and check-in rules and put its
 * own in their place. Check-in rules are the sharpest case, because the calendar reads them.
 *
 * One delete and one insert per table for the whole batch. The delete can name the batch's
 * offers in a single `IN (...)` because `LISTING_BATCH_SIZE` is held below `ID_CHUNK`; the
 * inserts still chunk, because five hundred listings is tens of thousands of media rows.
 */
async function writeListingChildren(
  ctx: ListingWriteContext,
  plans: readonly ListingPlan[],
): Promise<void> {
  const { db, providerKey } = ctx;
  const written = plans.filter(
    (plan): plan is ListingPlan & { listingOfferId: string } => plan.listingOfferId !== null,
  );
  if (written.length === 0) return;

  const offerIds = written.map((plan) => plan.listingOfferId);

  await db.delete(listingMedia).where(inArray(listingMedia.listingOfferId, offerIds));
  await insertRows(
    written.flatMap(({ listingId, listingOfferId, item }) =>
      item.media.map((media) => ({
        listingId,
        listingOfferId,
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

  await db.delete(listingText).where(inArray(listingText.listingOfferId, offerIds));
  await insertRows(
    written.flatMap(({ listingId, listingOfferId, item }) =>
      item.texts.map((text) => ({
        listingId,
        listingOfferId,
        kind: text.kind,
        locale: text.locale,
        value: text.value,
      })),
    ),
    async (chunk) => {
      await db.insert(listingText).values(chunk);
    },
  );

  await db.delete(listingAmenity).where(inArray(listingAmenity.listingOfferId, offerIds));
  await insertRows(
    written.flatMap(({ listingId, listingOfferId, item }) =>
      [
        ...new Set(
          item.amenities
            .map((externalId) => ctx.amenityIds.get(externalId))
            .filter((amenityId): amenityId is string => Boolean(amenityId)),
        ),
      ].map((amenityId) => ({ listingId, listingOfferId, amenityId })),
    ),
    async (chunk) => {
      await db.insert(listingAmenity).values(chunk);
    },
  );

  await db
    .delete(providerExtraCatalogue)
    .where(inArray(providerExtraCatalogue.listingOfferId, offerIds));
  await insertRows(
    written.flatMap(({ listingId, listingOfferId, item }) =>
      priceableExtras(listingId, item).map((extra) => ({
        listingId,
        listingOfferId,
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

  await db.delete(listingCheckinRule).where(inArray(listingCheckinRule.listingOfferId, offerIds));
  await insertRows(
    written.flatMap(({ listingId, listingOfferId, item }) =>
      item.checkinRules.map((rule) => ({
        listingId,
        listingOfferId,
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

  await db.delete(listingOneWayRule).where(inArray(listingOneWayRule.listingOfferId, offerIds));
  await insertRows(
    written.flatMap(({ listingId, listingOfferId, item }) =>
      item.oneWayRules.map((rule) => ({
        listingId,
        listingOfferId,
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
 * `scoreDuplicatePair` weighs what else the two sides agree on, and `worthReviewing`
 * throws out the pairs that agree on nothing but the model and the year. Pairs this
 * run touches that are still pending are re-scored, and pending pairs the rule no
 * longer proposes are deleted, so a change to either reaches the backlog on the next
 * full sync rather than only the pairs proposed after it.
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
  const [reviewable, sisterShips] = partition(scored, (pair) => worthReviewing(pair.signals));
  const fresh = reviewable.filter(({ row }) => row.candidateId === null);

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
    reviewable.filter(({ row }) => row.candidateId !== null && row.decision === "pending"),
  );

  await dropUnreviewableCandidates(
    db,
    sisterShips.filter(({ row }) => row.candidateId !== null && row.decision === "pending"),
  );

  return fresh.length;
}

function partition<T>(rows: T[], keep: (row: T) => boolean): [T[], T[]] {
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const row of rows) (keep(row) ? kept : dropped).push(row);
  return [kept, dropped];
}

/**
 * Removes pending pairs the current rule would not propose, so a change to the rule
 * reaches the backlog instead of only the pairs proposed after it. Only `pending`
 * rows: a reviewed pair is a person's decision and stays on the record whatever the
 * matcher would say about it today.
 */
async function dropUnreviewableCandidates(
  db: Database,
  scored: { row: DuplicatePairRow }[],
): Promise<void> {
  if (scored.length === 0) return;

  let dropped = 0;
  for (const chunk of chunked(scored, ID_CHUNK)) {
    const removed = await db
      .delete(listingDuplicateCandidate)
      .where(
        and(
          inArray(
            listingDuplicateCandidate.id,
            chunk.map(({ row }) => row.candidateId).filter((id): id is string => id !== null),
          ),
          eq(listingDuplicateCandidate.decision, "pending"),
        ),
      )
      .returning({ id: listingDuplicateCandidate.id });
    dropped += removed.length;
  }

  if (dropped > 0) {
    console.info(
      `[catalogue] dropped ${dropped} sister-ship duplicate candidate(s) from the queue`,
    );
  }
}

type DuplicatePairRow = {
  sourceAId: string;
  sourceBId: string;
  /** Null when the pair has not been proposed yet, which is what makes it new. */
  candidateId: string | null;
  decision: string | null;
  viaModelYear: boolean;
  viaNameBase: boolean;
  modelIdA: string | null;
  modelIdB: string | null;
  modelNameA: string | null;
  modelNameB: string | null;
  yearA: number | null;
  yearB: number | null;
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
    gates: { modelYear: row.viaModelYear, nameBase: row.viaNameBase },
    a: {
      title: row.titleA,
      modelId: row.modelIdA,
      modelName: row.modelNameA,
      yearBuilt: row.yearA,
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
      modelId: row.modelIdB,
      modelName: row.modelNameB,
      yearBuilt: row.yearB,
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
  const scope = sql.join(
    listingIds.map((id) => sql`${id}`),
    sql`, `,
  );

  const rows = await db.execute<DuplicatePairRow>(sql`
    /*
     * Two gates, unioned. Both propose a pair of offers from different providers sitting on
     * different listings; neither merges anything, and a human decides either way.
     *
     * Gate one is the original: the same resolved model and the same build year. It needs both
     * vendors to have spelled the model identically, and they frequently do not — "Bavaria
     * C46" and "Bavaria C46 - 5 cab." are two taxonomy rows — so a genuine duplicate could
     * never reach a reviewer at all.
     *
     * Gate two goes around the taxonomy entirely: the boat's own name, folded the way
     * yachtNameKey folds it, plus a berth within a few kilometres. The name is written to
     * listing_offer at projection time so this is an indexed equality rather than string work
     * across twenty thousand offers, and the bounding box is only a prefilter — the scorer
     * applies the real haversine afterwards.
     */
    with proposed as (
      select oa.id as offer_a, ob.id as offer_b, true as via_model_year, false as via_name_base
      from listing_offer oa
      join listing_offer_specification spa on spa.listing_offer_id = oa.id
      join listing_offer ob
        on ob.model_id = oa.model_id
       and ob.listing_id <> oa.listing_id
       and ob.provider_id <> oa.provider_id
       and ob.status = 'active'
      join listing_offer_specification spb
        on spb.listing_offer_id = ob.id and spb.year_built = spa.year_built
      where oa.listing_id in (${scope})
        and oa.status = 'active'
        and oa.model_id is not null
        and spa.year_built is not null

      union all

      select oa.id, ob.id, false, true
      from listing_offer oa
      join listing_offer ob
        on ob.name_key = oa.name_key
       and ob.listing_id <> oa.listing_id
       and ob.provider_id <> oa.provider_id
       and ob.status = 'active'
      left join base ba on ba.id = oa.home_base_id
      left join base bb on bb.id = ob.home_base_id
      where oa.listing_id in (${scope})
        and oa.status = 'active'
        and oa.name_key is not null
        /* Below this a folded title is initials or a stray year, not a boat's name. */
        and length(oa.name_key) >= 4
        and (
          ob.home_base_id = oa.home_base_id
          or (abs(bb.lat - ba.lat) <= 0.05 and abs(bb.lng - ba.lng) <= 0.05)
        )
    ),
    gated as (
      select
        offer_a,
        offer_b,
        bool_or(via_model_year) as via_model_year,
        bool_or(via_name_base) as via_name_base
      from proposed
      group by offer_a, offer_b
    )
    select
      a.id as "sourceAId",
      b.id as "sourceBId",
      d.id as "candidateId",
      d.decision::text as "decision",
      g.via_model_year as "viaModelYear",
      g.via_name_base as "viaNameBase",
      oa.model_id as "modelIdA",
      ob.model_id as "modelIdB",
      ma.name as "modelNameA",
      mb.name as "modelNameB",
      spa.year_built as "yearA",
      spb.year_built as "yearB",
      oa.title as "titleA",
      ob.title as "titleB",
      spa.length_m as "lengthA",
      spb.length_m as "lengthB",
      spa.cabins as "cabinsA",
      spb.cabins as "cabinsB",
      spa.berths as "berthsA",
      spb.berths as "berthsB",
      spa.heads as "headsA",
      spb.heads as "headsB",
      oa.home_base_id as "baseA",
      ob.home_base_id as "baseB",
      bsa.location_id as "locationA",
      bsb.location_id as "locationB",
      bsa.lat as "latA",
      bsb.lat as "latB",
      bsa.lng as "lngA",
      bsb.lng as "lngB",
      oa.builder_id as "builderA",
      ob.builder_id as "builderB",
      opa.name as "operatorA",
      opb.name as "operatorB"
    from gated g
    join listing_offer oa on oa.id = g.offer_a
    join listing_offer ob on ob.id = g.offer_b
    /*
     * Every fact is read from the offer, never from the listing composed above it. On a
     * listing that has already been merged those two are the same values on both sides, which
     * would score every remaining look-alike as a perfect match.
     */
    join listing_source a on a.id = oa.listing_source_id
    join listing_source b on b.id = ob.listing_source_id
    join provider_record pra on pra.id = a.provider_record_id
    left join listing_offer_specification spa on spa.listing_offer_id = oa.id
    left join listing_offer_specification spb on spb.listing_offer_id = ob.id
    left join yacht_model ma on ma.id = oa.model_id
    left join yacht_model mb on mb.id = ob.model_id
    left join base bsa on bsa.id = oa.home_base_id
    left join base bsb on bsb.id = ob.home_base_id
    left join operator opa on opa.id = oa.operator_id
    left join operator opb on opb.id = ob.operator_id
    left join listing_duplicate_candidate d
      on least(d.source_a_id, d.source_b_id) = least(a.id, b.id)
     and greatest(d.source_a_id, d.source_b_id) = greatest(a.id, b.id)
    where pra.provider_id = ${providerId}
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
