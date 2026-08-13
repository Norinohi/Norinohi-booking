import { base, country, location, region } from "@yacht-charter/db/schema/geography";
import {
  listing,
  listingAmenity,
  listingCheckinRule,
  listingMedia,
  listingOneWayRule,
  listingSpecification,
} from "@yacht-charter/db/schema/listing";
import { listingDuplicateCandidate, listingSource } from "@yacht-charter/db/schema/listing-source";
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
import { rebuildSearchReadModelsAfterSync } from "@yacht-charter/db/search/read-model";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "../registry";
import type {
  CanonicalCatalogue,
  ProviderKey,
  ProviderRecordSet,
  ProviderResourceType,
} from "../types";

type CanonicalListing = CanonicalCatalogue["listings"][number];

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
  now?: Date;
}

export interface CatalogueWriteSummary {
  listingsCreated: number;
  listingsUpdated: number;
  /** Drafts promoted by auto-publish, so a surprise is visible in the run counts. */
  listingsPublished: number;
  listingsSkipped: number;
  listingsHidden: number;
  duplicateCandidates: number;
  touchedListingIds: string[];
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
        city: item.city ?? null,
        email: item.email ?? null,
        phone: item.phone ?? null,
      })
      .onConflictDoUpdate({
        target: operator.slug,
        set: {
          name: sql`excluded.name`,
          country: sql`excluded.country`,
          city: sql`excluded.city`,
          email: sql`excluded.email`,
          phone: sql`excluded.phone`,
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
      .values({ code, name: item.name })
      .onConflictDoUpdate({ target: yachtCategory.code, set: { name: sql`excluded.name` } })
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

  const yachtRecordIds = await loadYachtRecordIds(db, providerId);
  const existingLinks = await loadExistingLinks(db, providerId);
  const matchCandidates = await loadMatchCandidates(db, providerId);

  const summary: CatalogueWriteSummary = {
    listingsCreated: 0,
    listingsUpdated: 0,
    listingsPublished: 0,
    listingsSkipped: 0,
    listingsHidden: 0,
    duplicateCandidates: 0,
    touchedListingIds: [],
  };

  for (const item of catalogue.listings) {
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
      paymentPolicy: item.paymentPolicy ?? null,
      providerRating: decimal(item.rating),
      providerReviewCount: item.reviewCount ?? null,
      freshnessAt: now,
    };

    let listingId = decision.listingId;
    if (listingId) {
      await db.update(listing).set(columns).where(eq(listing.id, listingId));
      summary.listingsUpdated += 1;
    } else {
      const created = await insertListingWithFreeSlug(db, item.slug, {
        ...columns,
        // Draft unless the provider is explicitly trusted: thousands of unreviewed
        // yachts must not go live on the first run of a new connector.
        status: options.autoPublish ? "published" : "draft",
      });
      if (!created) {
        summary.listingsSkipped += 1;
        continue;
      }
      listingId = created.id;
      summary.listingsCreated += 1;
      matchCandidates.set(incomingKey, listingId);
    }

    await writeListingChildren(db, providerKey, listingId, item, amenityIds);

    const sourceId = await upsertListingSource(db, {
      existing: existingLinks.get(item.externalId) ?? null,
      listingId,
      providerRecordId,
      externalYachtId: item.externalId,
      externalCompanyId: item.externalCompanyId,
      externalBaseId: item.externalBaseId,
      decision,
      now,
    });

    if (sourceId) {
      await db.update(listing).set({ primarySourceId: sourceId }).where(eq(listing.id, listingId));
      existingLinks.set(item.externalId, {
        listingSourceId: sourceId,
        listingId,
        matchStatus: decision.matchStatus,
      });
    }

    summary.touchedListingIds.push(listingId);
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

  await rebuildSearchReadModelsAfterSync(db, {
    listingIds: [...new Set([...summary.touchedListingIds, ...hidden, ...published])],
  });

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
  const [created] = await db
    .insert(yachtModel)
    .values({ builderId, name })
    .onConflictDoNothing(
      builderId === null
        ? { target: yachtModel.name, where: isNull(yachtModel.builderId) }
        : { target: [yachtModel.builderId, yachtModel.name] },
    )
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

/**
 * Two providers can both mint `bora-2019`; the first one there keeps it.
 *
 * The insert is part of the search rather than a step after it. `listing.slug` is
 * unique, so checking and then inserting is a race, and losing it used to raise
 * out of the per-listing loop and fail the entire projection over one collision.
 * Here a taken slug is just the signal to try the next suffix.
 */
async function insertListingWithFreeSlug(
  db: Database,
  candidate: string,
  columns: Omit<typeof listing.$inferInsert, "slug">,
): Promise<{ id: string } | null> {
  const seed = candidate === "" ? "listing" : candidate;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? seed : `${seed}-${attempt + 1}`;
    const [created] = await db
      .insert(listing)
      .values({ ...columns, slug })
      .onConflictDoNothing({ target: listing.slug })
      .returning({ id: listing.id });
    if (created) return created;
  }

  const [fallback] = await db
    .insert(listing)
    .values({ ...columns, slug: `${seed}-${Date.now()}` })
    .onConflictDoNothing({ target: listing.slug })
    .returning({ id: listing.id });
  return fallback ?? null;
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

async function upsertListingSource(
  db: Database,
  input: {
    existing: ExistingSourceLink | null;
    listingId: string;
    providerRecordId: string;
    externalYachtId: string;
    externalCompanyId: string;
    externalBaseId: string;
    decision: ListingMatchDecision;
    now: Date;
  },
): Promise<string | null> {
  const matchFields = {
    matchStatus: input.decision.matchStatus,
    ...(input.decision.matchedBy
      ? {
          matchConfidence: input.decision.matchConfidence?.toFixed(4) ?? null,
          matchedBy: input.decision.matchedBy,
          matchedAt: input.now,
        }
      : {}),
  };

  if (input.existing) {
    await db
      .update(listingSource)
      .set({
        listingId: input.listingId,
        providerRecordId: input.providerRecordId,
        externalCompanyId: input.externalCompanyId,
        externalBaseId: input.externalBaseId,
        ...matchFields,
      })
      .where(eq(listingSource.id, input.existing.listingSourceId));
    return input.existing.listingSourceId;
  }

  const [row] = await db
    .insert(listingSource)
    .values({
      listingId: input.listingId,
      providerRecordId: input.providerRecordId,
      externalYachtId: input.externalYachtId,
      externalCompanyId: input.externalCompanyId,
      externalBaseId: input.externalBaseId,
      ...matchFields,
    })
    .returning({ id: listingSource.id });

  return row?.id ?? null;
}

/**
 * Provider-owned child rows are replaced wholesale rather than diffed: the dump is
 * the complete truth for this listing, and a diff would leave rows the provider has
 * dropped behind forever.
 */
async function writeListingChildren(
  db: Database,
  providerKey: ProviderKey,
  listingId: string,
  item: CanonicalListing,
  amenityIds: Map<string, string>,
): Promise<void> {
  await db
    .insert(listingSpecification)
    .values({
      listingId,
      lengthM: decimal(item.spec.lengthM),
      beamM: decimal(item.spec.beamM),
      draftM: decimal(item.spec.draftM),
      yearBuilt: item.spec.yearBuilt,
      cabins: item.spec.cabins,
      berths: item.spec.berths,
      heads: item.spec.heads,
      engines: item.spec.engines ?? null,
      fuelCapacity: item.spec.fuelCapacity ?? null,
      waterCapacity: item.spec.waterCapacity ?? null,
    })
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
        engines: sql`excluded.engines`,
        fuelCapacity: sql`excluded.fuel_capacity`,
        waterCapacity: sql`excluded.water_capacity`,
      },
    });

  // Scoped by source so a second provider's media on a merged listing survives.
  await db
    .delete(listingMedia)
    .where(and(eq(listingMedia.listingId, listingId), eq(listingMedia.source, providerKey)));
  if (item.media.length > 0) {
    await db.insert(listingMedia).values(
      item.media.map((media) => ({
        listingId,
        source: providerKey,
        // Verbatim vendor URL, no Cloudinary id: we have no confirmed rights to
        // copy or re-host provider media yet (Q-MEDIA).
        externalUrl: media.externalUrl,
        role: media.role,
        sortOrder: media.sortOrder,
      })),
    );
  }

  await db.delete(listingText).where(eq(listingText.listingId, listingId));
  if (item.texts.length > 0) {
    await db.insert(listingText).values(
      item.texts.map((text) => ({
        listingId,
        kind: text.kind,
        locale: text.locale,
        value: text.value,
      })),
    );
  }

  await db.delete(listingAmenity).where(eq(listingAmenity.listingId, listingId));
  const resolvedAmenities = [
    ...new Set(
      item.amenities
        .map((externalId) => amenityIds.get(externalId))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (resolvedAmenities.length > 0) {
    await db
      .insert(listingAmenity)
      .values(resolvedAmenities.map((amenityId) => ({ listingId, amenityId })));
  }

  await db.delete(listingCheckinRule).where(eq(listingCheckinRule.listingId, listingId));
  if (item.checkinRules.length > 0) {
    await db.insert(listingCheckinRule).values(
      item.checkinRules.map((rule) => ({
        listingId,
        checkinWeekday: rule.checkinWeekday ?? null,
        checkoutWeekday: rule.checkoutWeekday ?? null,
        minNights: rule.minNights ?? null,
        maxNights: rule.maxNights ?? null,
      })),
    );
  }

  await db.delete(listingOneWayRule).where(eq(listingOneWayRule.listingId, listingId));
  if (item.oneWayRules.length > 0) {
    await db.insert(listingOneWayRule).values(
      item.oneWayRules.map((rule) => ({
        listingId,
        startDate: rule.startDate,
        endDate: rule.endDate,
        isOneWay: rule.isOneWay,
      })),
    );
  }
}

/**
 * Cross-provider look-alikes are never merged, only proposed: same model, same
 * build year, different provider. A human decides in `listing_duplicate_candidate`.
 */
async function recordDuplicateCandidates(
  db: Database,
  providerId: string,
  listingIds: string[],
): Promise<number> {
  if (listingIds.length === 0) return 0;

  const rows = await db.execute<{
    sourceAId: string;
    sourceBId: string;
    modelId: string;
    yearBuilt: number;
  }>(sql`
    select distinct
      a.id as "sourceAId",
      b.id as "sourceBId",
      la.model_id as "modelId",
      sa.year_built as "yearBuilt"
    from listing_source a
    join provider_record pra on pra.id = a.provider_record_id
    join listing la on la.id = a.listing_id
    join listing_specification sa on sa.listing_id = la.id
    join listing lb on lb.model_id = la.model_id and lb.id <> la.id
    join listing_specification sb on sb.listing_id = lb.id and sb.year_built = sa.year_built
    join listing_source b on b.listing_id = lb.id
    join provider_record prb on prb.id = b.provider_record_id
    where pra.provider_id = ${providerId}
      and prb.provider_id <> ${providerId}
      and la.model_id is not null
      and sa.year_built is not null
      and la.id in (${sql.join(
        listingIds.map((id) => sql`${id}`),
        sql`, `,
      )})
      and not exists (
        select 1 from listing_duplicate_candidate d
        where (d.source_a_id = a.id and d.source_b_id = b.id)
           or (d.source_a_id = b.id and d.source_b_id = a.id)
      )
  `);

  const pending = rows.rows;
  if (pending.length === 0) return 0;

  await db.insert(listingDuplicateCandidate).values(
    pending.map((row) => ({
      sourceAId: row.sourceAId,
      sourceBId: row.sourceBId,
      signals: { modelId: row.modelId, yearBuilt: row.yearBuilt, matchedOn: "model+yearBuilt" },
      confidence: "0.5000",
      decision: "pending" as const,
    })),
  );

  return pending.length;
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
