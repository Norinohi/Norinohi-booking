import { ORPCError } from "@orpc/server";
import { base, location } from "@yacht-charter/db/schema/geography";
import {
  listing,
  listingAmenity,
  listingMedia,
  listingSpecification,
} from "@yacht-charter/db/schema/listing";
import { listingText } from "@yacht-charter/db/schema/listing-text";
import { listingOffer } from "@yacht-charter/db/schema/listing-offer";
import { listingDuplicateCandidate, listingSource } from "@yacht-charter/db/schema/listing-source";
import { operator } from "@yacht-charter/db/schema/operator";
import { provider, providerRecord } from "@yacht-charter/db/schema/provider";
import { amenity, builder, yachtCategory, yachtModel } from "@yacht-charter/db/schema/taxonomy";
import { rebuildSearchReadModelsAfterSync } from "@yacht-charter/db/search/read-model";
import { resolveCanonicalListings } from "@yacht-charter/providers/sync/canonical-listing-writer";
import { and, asc, count, countDistinct, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { z } from "zod";

import type { Database, DatabaseExecutor } from "../context";
import { duplicateSignalsSchema } from "../contracts/admin";
import type {
  duplicateCandidateSchema,
  duplicateConfirmInputSchema,
  duplicateDetailInputSchema,
  duplicateDetailListingSchema,
  duplicateDetailSchema,
  duplicateDetailSideSchema,
  duplicatePhotoSchema,
  duplicateQueueInputSchema,
  duplicateQueueSchema,
  duplicateResolutionSchema,
  duplicateSideSchema,
  duplicateMetricsSchema,
  duplicateSplitInputSchema,
  duplicateSplitSchema,
} from "../contracts/admin";
import { writeAuditLog } from "./audit";
import { paginatedQuery, totalFrom } from "./pagination";

type QueueInput = z.infer<typeof duplicateQueueInputSchema>;
type QueueResult = z.infer<typeof duplicateQueueSchema>;
type Summary = QueueResult["summary"];
type ConfidenceBand = Summary["confidenceBands"][number]["band"];
type Candidate = z.infer<typeof duplicateCandidateSchema>;
type Side = z.infer<typeof duplicateSideSchema>;
type ConfirmInput = z.infer<typeof duplicateConfirmInputSchema>;
type DetailInput = z.infer<typeof duplicateDetailInputSchema>;
type Detail = z.infer<typeof duplicateDetailSchema>;
type DetailSide = z.infer<typeof duplicateDetailSideSchema>;
type DetailListing = z.infer<typeof duplicateDetailListingSchema>;
type Photo = z.infer<typeof duplicatePhotoSchema>;
type Resolution = z.infer<typeof duplicateResolutionSchema>;
type SplitInput = z.infer<typeof duplicateSplitInputSchema>;
type SplitResult = z.infer<typeof duplicateSplitSchema>;
type Metrics = z.infer<typeof duplicateMetricsSchema>;

/** Every band, in the order the filter lists them, so an empty one is simply absent. */
const BANDS: readonly ConfidenceBand[] = ["high", "medium", "low", "unknown"];

/**
 * Media precedence from docs/backend-architecture.md §3: Booking Manager photos
 * win over NauSYS on a listing carrying both, everything else is a fallback.
 */
const MEDIA_SOURCE_RANK = new Map([
  ["booking_manager", 0],
  ["nausys", 1],
]);

const UNRANKED_SOURCE = 2;

export type MediaRow = {
  source: string | null;
  role: "main" | "layout" | "gallery";
  sortOrder: number;
  externalUrl: string;
};

/**
 * Applied when reading rather than when merging: the catalogue writer deletes and
 * re-inserts `listing_media` by `source` on every run, so anything a merge did to
 * those rows would be gone by the next sync.
 */
export function pickPrimaryImage(media: readonly MediaRow[]): string | null {
  let best: MediaRow | null = null;
  for (const row of media) {
    if (best === null || mediaOrder(row) < mediaOrder(best)) best = row;
  }
  return best?.externalUrl ?? null;
}

function mediaOrder(row: MediaRow): number {
  const sourceRank =
    row.source === null ? UNRANKED_SOURCE : (MEDIA_SOURCE_RANK.get(row.source) ?? UNRANKED_SOURCE);
  const roleRank = row.role === "main" ? 0 : row.role === "gallery" ? 1 : 2;
  return sourceRank * 1_000_000 + roleRank * 100_000 + Math.min(row.sortOrder, 99_999);
}

/** Where a scored pair sits: the bands the queue filter offers, in confidence order. */
const HIGH_CONFIDENCE = 0.9;
const MEDIUM_CONFIDENCE = 0.7;

const matchedOnExpression = sql<
  string | null
>`${listingDuplicateCandidate.signals} ->> 'matchedOn'`;

function confidenceCondition(band: QueueInput["confidence"]): SQL | undefined {
  if (band === "all") return undefined;
  if (band === "unknown") return isNull(listingDuplicateCandidate.confidence);
  if (band === "high") return sql`${listingDuplicateCandidate.confidence} >= ${HIGH_CONFIDENCE}`;
  if (band === "medium") {
    return sql`${listingDuplicateCandidate.confidence} >= ${MEDIUM_CONFIDENCE} and ${listingDuplicateCandidate.confidence} < ${HIGH_CONFIDENCE}`;
  }
  return sql`${listingDuplicateCandidate.confidence} < ${MEDIUM_CONFIDENCE}`;
}

function bandCount(band: ConfidenceBand) {
  return sql<number>`count(*) filter (where ${confidenceCondition(band)})`.mapWith(Number);
}

/*
 * A confirmed merge that is not standing: the pair's two sources no longer sit on one
 * listing. The candidate keeps its `confirmed` verdict — the merge did happen — so this is
 * a fact about the present, not a fourth decision.
 *
 * Read from where the sources point rather than from a split entry in the audit trail,
 * because the trail only says a split once happened: after a re-merge it still says so, and
 * the pair would read as undone forever. Only meaningful on a confirmed candidate, which is
 * the only place either caller applies it.
 *
 * Written against the alias `d`, so a query using it must name the candidate table that.
 */
const undoneExpression = sql`
  exists (
    select 1
    from listing_source sa, listing_source sb
    where sa.id = d.source_a_id
      and sb.id = d.source_b_id
      and sa.listing_id is distinct from sb.listing_id
  )
`;

/** Which of the page's confirmations were later split back apart. */
async function loadUndone(
  db: Database,
  rows: readonly { id: string; decision: string }[],
): Promise<Set<string>> {
  /* Only a confirmation can be undone, and the queue is usually looking at other decisions. */
  const ids = rows.filter((row) => row.decision === "confirmed").map((row) => row.id);
  if (ids.length === 0) return new Set();

  const found = await db.execute<{ id: string }>(sql`
    select d.id
    from listing_duplicate_candidate d
    where d.id in (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})
      and ${undoneExpression}
  `);

  return new Set(found.rows.map((row) => row.id));
}

export async function listDuplicateCandidates(
  db: Database,
  input: QueueInput,
): Promise<QueueResult> {
  const decisionWhere = eq(listingDuplicateCandidate.decision, input.decision);
  const where = and(
    decisionWhere,
    confidenceCondition(input.confidence),
    input.matchedOn === undefined ? undefined : eq(matchedOnExpression, input.matchedOn),
  );

  const [{ rows, pagination }, summary] = await Promise.all([
    paginatedQuery({
      page: input.page,
      pageSize: input.pageSize,
      rows: (limit, offset) =>
        db
          .select()
          .from(listingDuplicateCandidate)
          .where(where)
          /*
           * Two different questions, so two orders. The work queue is triaged: the pairs
           * most likely to be duplicates come first. The audit tabs are read the other way
           * round — "what did we just decide" — where confidence is a property of the
           * proposal and says nothing about recency, and a pair decided a minute ago could
           * sit on page nine behind everything scored higher.
           */
          .orderBy(
            ...(input.decision === "pending"
              ? [
                  desc(listingDuplicateCandidate.confidence),
                  desc(listingDuplicateCandidate.createdAt),
                ]
              : [
                  desc(listingDuplicateCandidate.reviewedAt),
                  desc(listingDuplicateCandidate.updatedAt),
                ]),
            desc(listingDuplicateCandidate.id),
          )
          .limit(limit)
          .offset(offset),
      total: async () =>
        totalFrom(
          await db.select({ totalItems: count() }).from(listingDuplicateCandidate).where(where),
        ),
    }),
    loadQueueSummary(db, decisionWhere, where),
  ]);

  const [sides, undone] = await Promise.all([
    loadSides(
      db,
      rows.flatMap((row) => [row.sourceAId, row.sourceBId]),
    ),
    loadUndone(db, rows),
  ]);

  const items: Candidate[] = rows.map((row) => ({
    id: row.id,
    decision: row.decision,
    confidence: row.confidence === null ? null : Number(row.confidence),
    signals: duplicateSignalsSchema.safeParse(row.signals).data ?? null,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewerNote: row.reviewerNote,
    undone: undone.has(row.id),
    sideA: sides.get(row.sourceAId) ?? missingSide(row.sourceAId),
    sideB: sides.get(row.sourceBId) ?? missingSide(row.sourceBId),
  }));

  return { items, pagination, summary };
}

/**
 * `decisionWhere` is what the two facets count over — a facet that narrowed itself would
 * drop the option a reviewer just chose out of its own menu. `where` is the full filter,
 * and only the yacht count is read through it.
 */
async function loadQueueSummary(
  db: Database,
  decisionWhere: SQL,
  where: SQL | undefined,
): Promise<Summary> {
  const [decisions, listings, matchTypes, bands] = await Promise.all([
    db
      .select({ decision: listingDuplicateCandidate.decision, total: count() })
      .from(listingDuplicateCandidate)
      .groupBy(listingDuplicateCandidate.decision),
    db
      .select({ total: countDistinct(listingSource.listingId) })
      .from(listingDuplicateCandidate)
      .innerJoin(
        listingSource,
        or(
          eq(listingSource.id, listingDuplicateCandidate.sourceAId),
          eq(listingSource.id, listingDuplicateCandidate.sourceBId),
        ),
      )
      .where(where),
    db
      .select({ value: matchedOnExpression, total: count() })
      .from(listingDuplicateCandidate)
      .where(decisionWhere)
      .groupBy(matchedOnExpression),
    /* Filtered counts rather than a grouped CASE: the thresholds are bound parameters, and
       Postgres will not match a parameterised GROUP BY expression to its select list. */
    db
      .select({
        high: bandCount("high"),
        medium: bandCount("medium"),
        low: bandCount("low"),
        unknown: bandCount("unknown"),
      })
      .from(listingDuplicateCandidate)
      .where(decisionWhere),
  ]);

  const decisionCounts = { pending: 0, confirmed: 0, rejected: 0, deferred: 0 };
  for (const row of decisions) decisionCounts[row.decision] = row.total;

  return {
    decisionCounts,
    listingCount: listings[0]?.total ?? 0,
    matchTypes: matchTypes
      .filter((row): row is { value: string; total: number } => row.value !== null)
      .map((row) => ({ value: row.value, count: row.total }))
      .sort((left, right) => right.count - left.count),
    /* A band nobody's queue holds is left out rather than offered as an empty filter. */
    confidenceBands: BANDS.flatMap((band) => {
      const total = bands[0]?.[band] ?? 0;
      return total > 0 ? [{ band, count: total }] : [];
    }),
  };
}

/** A source row can be gone while its candidate is not; the pair still renders. */
function missingSide(sourceId: string): Side {
  return {
    sourceId,
    provider: "",
    externalYachtId: "",
    matchStatus: "unmatched",
    listing: null,
  };
}

async function loadSides(db: Database, sourceIds: string[]): Promise<Map<string, Side>> {
  const ids = [...new Set(sourceIds)];
  if (ids.length === 0) return new Map();

  const rows = await db
    .select({
      sourceId: listingSource.id,
      provider: provider.code,
      externalYachtId: listingSource.externalYachtId,
      matchStatus: listingSource.matchStatus,
      listingId: listing.id,
      title: listing.title,
      slug: listing.slug,
      status: listing.status,
      operatorName: operator.name,
      modelName: yachtModel.name,
      yearBuilt: listingSpecification.yearBuilt,
      lengthM: listingSpecification.lengthM,
      cabins: listingSpecification.cabins,
      berths: listingSpecification.berths,
      baseName: base.name,
      locationName: location.name,
    })
    .from(listingSource)
    .leftJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
    .leftJoin(provider, eq(provider.id, providerRecord.providerId))
    .leftJoin(listing, eq(listing.id, listingSource.listingId))
    .leftJoin(operator, eq(operator.id, listing.operatorId))
    .leftJoin(yachtModel, eq(yachtModel.id, listing.modelId))
    .leftJoin(listingSpecification, eq(listingSpecification.listingId, listing.id))
    .leftJoin(base, eq(base.id, listing.homeBaseId))
    .leftJoin(location, eq(location.id, base.locationId))
    .where(inArray(listingSource.id, ids));

  const listingIds = [
    ...new Set(rows.map((row) => row.listingId).filter((id): id is string => id !== null)),
  ];
  const photos = await loadPhotos(db, listingIds);

  return new Map(
    rows.map((row) => [
      row.sourceId,
      {
        sourceId: row.sourceId,
        provider: row.provider ?? "",
        externalYachtId: row.externalYachtId,
        matchStatus: row.matchStatus,
        listing:
          row.listingId === null || row.title === null || row.slug === null || row.status === null
            ? null
            : {
                id: row.listingId,
                title: row.title,
                slug: row.slug,
                status: row.status,
                operatorName: row.operatorName,
                modelName: row.modelName,
                yearBuilt: row.yearBuilt,
                lengthM: row.lengthM === null ? null : Number(row.lengthM),
                cabins: row.cabins,
                berths: row.berths,
                baseName: row.baseName,
                locationName: row.locationName,
                photos: photos.get(row.listingId) ?? [],
              },
      } satisfies Side,
    ]),
  );
}

/**
 * Shared with the listing admin table so both screens front the same photo the
 * search card does; the precedence lives in `pickPrimaryImage` above.
 */
export async function loadPrimaryImages(
  db: Database,
  listingIds: string[],
): Promise<Map<string, string>> {
  if (listingIds.length === 0) return new Map();

  const rows = await db
    .select({
      listingId: listingMedia.listingId,
      source: listingMedia.source,
      role: listingMedia.role,
      sortOrder: listingMedia.sortOrder,
      externalUrl: listingMedia.externalUrl,
    })
    .from(listingMedia)
    .where(inArray(listingMedia.listingId, listingIds));

  const byListing = new Map<string, MediaRow[]>();
  for (const row of rows) {
    const bucket = byListing.get(row.listingId) ?? [];
    bucket.push(row);
    byListing.set(row.listingId, bucket);
  }

  const primary = new Map<string, string>();
  for (const [listingId, media] of byListing) {
    const url = pickPrimaryImage(media);
    if (url) primary.set(listingId, url);
  }
  return primary;
}

/**
 * The second read the review screen makes, on demand: everything the queue row omits
 * because paying for it 20 pairs at a time would be waste — the whole photo set and
 * the long tail of specs. Two look-alikes with the same model, year and cabin count
 * are told apart by their photos and by beam, draft, engine and deposit, so those are
 * what this returns.
 */
export async function getDuplicateCandidateDetail(
  db: Database,
  input: DetailInput,
): Promise<Detail> {
  const [candidate] = await db
    .select({
      id: listingDuplicateCandidate.id,
      sourceAId: listingDuplicateCandidate.sourceAId,
      sourceBId: listingDuplicateCandidate.sourceBId,
    })
    .from(listingDuplicateCandidate)
    .where(eq(listingDuplicateCandidate.id, input.candidateId))
    .limit(1);

  if (!candidate) throw new ORPCError("NOT_FOUND", { message: "Unknown duplicate candidate" });

  const sides = await loadDetailSides(db, [candidate.sourceAId, candidate.sourceBId]);

  return {
    candidateId: candidate.id,
    sideA: sides.get(candidate.sourceAId) ?? { sourceId: candidate.sourceAId, listing: null },
    sideB: sides.get(candidate.sourceBId) ?? { sourceId: candidate.sourceBId, listing: null },
  };
}

async function loadDetailSides(
  db: Database,
  sourceIds: string[],
): Promise<Map<string, DetailSide>> {
  const ids = [...new Set(sourceIds)];

  const rows = await db
    .select({
      sourceId: listingSource.id,
      listingId: listing.id,
      title: listing.title,
      slug: listing.slug,
      categoryName: yachtCategory.name,
      builderName: builder.name,
      crewType: listing.crewType,
      securityDepositMinor: listing.securityDepositMinor,
      securityDepositCurrency: listing.securityDepositCurrency,
      depositInsuranceIncluded: listing.depositInsuranceIncluded,
      petsAllowed: listing.petsAllowed,
      defaultCurrency: listing.defaultCurrency,
      providerRating: listing.providerRating,
      providerReviewCount: listing.providerReviewCount,
      freshnessAt: listing.freshnessAt,
      updatedAt: listing.updatedAt,
      beamM: listingSpecification.beamM,
      draftM: listingSpecification.draftM,
      heads: listingSpecification.heads,
      showers: listingSpecification.showers,
      engines: listingSpecification.engines,
      enginePower: listingSpecification.enginePower,
      fuelType: listingSpecification.fuelType,
      fuelCapacity: listingSpecification.fuelCapacity,
      waterCapacity: listingSpecification.waterCapacity,
      propulsionType: listingSpecification.propulsionType,
      steeringType: listingSpecification.steeringType,
      sailType: listingSpecification.sailType,
    })
    .from(listingSource)
    .leftJoin(listing, eq(listing.id, listingSource.listingId))
    .leftJoin(yachtCategory, eq(yachtCategory.id, listing.categoryId))
    .leftJoin(builder, eq(builder.id, listing.builderId))
    .leftJoin(listingSpecification, eq(listingSpecification.listingId, listing.id))
    .where(inArray(listingSource.id, ids));

  const listingIds = [
    ...new Set(rows.map((row) => row.listingId).filter((id): id is string => id !== null)),
  ];

  const [amenities, descriptions] = await Promise.all([
    loadAmenityNames(db, listingIds),
    loadDescriptions(db, listingIds),
  ]);

  return new Map(
    rows.map((row) => {
      const listingId = row.listingId;
      const detail: DetailListing | null =
        listingId === null || row.title === null || row.slug === null
          ? null
          : {
              id: listingId,
              title: row.title,
              slug: row.slug,
              categoryName: row.categoryName,
              builderName: row.builderName,
              crewType: row.crewType,
              beamM: numeric(row.beamM),
              draftM: numeric(row.draftM),
              heads: row.heads,
              showers: row.showers,
              engines: row.engines,
              enginePower: row.enginePower,
              fuelType: row.fuelType,
              fuelCapacity: row.fuelCapacity,
              waterCapacity: row.waterCapacity,
              propulsionType: row.propulsionType,
              steeringType: row.steeringType,
              sailType: row.sailType,
              securityDepositMinor: row.securityDepositMinor,
              securityDepositCurrency: row.securityDepositCurrency,
              depositInsuranceIncluded: row.depositInsuranceIncluded ?? false,
              petsAllowed: row.petsAllowed ?? false,
              defaultCurrency: row.defaultCurrency,
              providerRating: numeric(row.providerRating),
              providerReviewCount: row.providerReviewCount,
              amenities: amenities.get(listingId) ?? [],
              description: descriptions.get(listingId) ?? null,
              freshnessAt: row.freshnessAt?.toISOString() ?? null,
              updatedAt: row.updatedAt?.toISOString() ?? null,
            };

      return [row.sourceId, { sourceId: row.sourceId, listing: detail } satisfies DetailSide];
    }),
  );
}

/** Drizzle hands `numeric` columns back as strings so no precision is lost in the driver. */
function numeric(value: string | null): number | null {
  return value === null ? null : Number(value);
}

async function loadPhotos(db: Database, listingIds: string[]): Promise<Map<string, Photo[]>> {
  if (listingIds.length === 0) return new Map();

  const rows = await db
    .select({
      listingId: listingMedia.listingId,
      source: listingMedia.source,
      role: listingMedia.role,
      sortOrder: listingMedia.sortOrder,
      externalUrl: listingMedia.externalUrl,
    })
    .from(listingMedia)
    .where(inArray(listingMedia.listingId, listingIds));

  const byListing = new Map<string, Photo[]>();
  for (const row of [...rows].sort((left, right) => mediaOrder(left) - mediaOrder(right))) {
    const bucket = byListing.get(row.listingId) ?? [];
    bucket.push({ url: row.externalUrl, role: row.role, source: row.source });
    byListing.set(row.listingId, bucket);
  }
  return byListing;
}

async function loadAmenityNames(
  db: Database,
  listingIds: string[],
): Promise<Map<string, string[]>> {
  if (listingIds.length === 0) return new Map();

  const rows = await db
    .select({ listingId: listingAmenity.listingId, name: amenity.name })
    .from(listingAmenity)
    .innerJoin(amenity, eq(amenity.id, listingAmenity.amenityId))
    .where(inArray(listingAmenity.listingId, listingIds))
    .orderBy(asc(amenity.name));

  const byListing = new Map<string, string[]>();
  for (const row of rows) {
    const bucket = byListing.get(row.listingId) ?? [];
    bucket.push(row.name);
    byListing.set(row.listingId, bucket);
  }
  return byListing;
}

/** English where the provider shipped it, otherwise whichever locale sorts first. */
async function loadDescriptions(db: Database, listingIds: string[]): Promise<Map<string, string>> {
  if (listingIds.length === 0) return new Map();

  const rows = await db
    .select({
      listingId: listingText.listingId,
      locale: listingText.locale,
      value: listingText.value,
    })
    .from(listingText)
    .where(and(inArray(listingText.listingId, listingIds), eq(listingText.kind, "description")))
    .orderBy(asc(listingText.locale));

  const byListing = new Map<string, string>();
  for (const row of rows) {
    const held = byListing.get(row.listingId);
    if (held === undefined || row.locale === "en") byListing.set(row.listingId, row.value);
  }
  return byListing;
}

/**
 * Merges a reviewed pair onto the listing the reviewer chose to keep.
 *
 * The loser is hidden rather than deleted: bookings, quotes and payments still
 * reference it. Its sources are repointed first so the surviving listing carries
 * both providers' inventory, and both are stamped `confirmed`, which is the state
 * the catalogue writer refuses to overwrite on the next sync. Any other pending pair
 * the repoint collapsed onto a single listing closes with it.
 */
/**
 * Every table that carries a denormalised `listing_id` beside its offer.
 *
 * The pair has to move together. `listing_id` is kept on these because the search filters scan
 * it directly, and a merge is the one moment the two can disagree — a row still naming the
 * listing its offer has left would be read by search and quoted from somewhere else.
 */
const OFFER_CHILD_TABLES = [
  "availability_slot",
  "listing_price_period",
  "listing_free_period",
  "listing_refused_period",
  "listing_media",
  "provider_extra_catalogue",
  "listing_text",
  "listing_amenity",
  "listing_checkin_rule",
  "listing_one_way_rule",
] as const;

/**
 * Confirms that two providers are selling one yacht, and puts both offers under one listing.
 *
 * The offers move; nothing is discarded. That is the whole point of the model: the losing
 * listing's inventory is not hidden, it is now a second way to buy the surviving one, and the
 * quote picks between them per request. Before the offer model this merge kept whichever
 * provider synced last, because prices and calendars were keyed on the listing.
 *
 * The emptied listing is marked `merged` rather than `hidden` and keeps a pointer to the
 * survivor. It is not deleted because bookings and quotes still reference it, and `hidden`
 * would be a lie: nobody withdrew it, its offers went somewhere else.
 */
export async function confirmDuplicateCandidate(
  db: Database,
  actorUserId: string,
  input: ConfirmInput,
): Promise<Resolution> {
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const candidate = await lockDecidableCandidate(tx, input.candidateId);

    const sources = await tx
      .select({ id: listingSource.id, listingId: listingSource.listingId })
      .from(listingSource)
      .where(inArray(listingSource.id, [candidate.sourceAId, candidate.sourceBId]));

    const listingIds = new Set(
      sources.map((row) => row.listingId).filter((id): id is string => id !== null),
    );
    if (!listingIds.has(input.keepListingId)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "keepListingId must be one of the two candidate listings",
      });
    }

    const losingListingId = [...listingIds].find((id) => id !== input.keepListingId) ?? null;
    if (!losingListingId) {
      throw new ORPCError("CONFLICT", {
        message: "Both sources are already on this listing",
      });
    }

    const moved = await moveOffers(tx, losingListingId, input.keepListingId);

    await tx
      .update(listingSource)
      .set({ listingId: input.keepListingId })
      .where(eq(listingSource.listingId, losingListingId));

    await tx
      .update(listingSource)
      .set({
        matchStatus: "confirmed",
        matchConfidence: candidate.confidence,
        matchedBy: `admin:${actorUserId}`,
        matchedAt: now,
      })
      .where(inArray(listingSource.id, [candidate.sourceAId, candidate.sourceBId]));

    await tx
      .update(listingDuplicateCandidate)
      .set({
        decision: "confirmed",
        reviewer: actorUserId,
        reviewerNote: input.note ?? null,
        reviewedAt: now,
      })
      .where(eq(listingDuplicateCandidate.id, candidate.id));

    /*
     * One listing takes part in as many pairs as it has look-alikes, so repointing the
     * loser's sources can leave another pending pair with the same listing on both
     * sides. There is nothing left to decide on that card — the two sources are already
     * one listing — so it closes here rather than being handed to a reviewer. Its own
     * `confirmed` is the truth: the pair did end in a merge, this one.
     */
    const collapsed = await tx
      .update(listingDuplicateCandidate)
      .set({ decision: "confirmed", reviewer: actorUserId, reviewedAt: now })
      .where(
        and(
          eq(listingDuplicateCandidate.decision, "pending"),
          sql`exists (
            select 1
            from listing_source sa
            join listing_source sb on sb.id = ${listingDuplicateCandidate.sourceBId}
            where sa.id = ${listingDuplicateCandidate.sourceAId}
              and sa.listing_id is not null
              and sa.listing_id = sb.listing_id
          )`,
        ),
      )
      .returning({ id: listingDuplicateCandidate.id });

    await carryListingReferences(tx, losingListingId, input.keepListingId);

    await tx
      .update(listing)
      .set({ status: "merged", mergedIntoListingId: input.keepListingId })
      .where(eq(listing.id, losingListingId));

    await writeAuditLog(tx, {
      actorUserId,
      action: "merge",
      entityType: "listing",
      entityId: input.keepListingId,
      /* Enough to undo it: which offers moved, and where each came from. */
      before: {
        candidateId: candidate.id,
        decision: candidate.decision,
        listingIds: [...listingIds],
        sourceIds: sources.map((row) => ({ id: row.id, listingId: row.listingId })),
        offers: moved.map((offer) => ({ id: offer.id, listingId: losingListingId })),
      },
      after: {
        keptListingId: input.keepListingId,
        mergedListingId: losingListingId,
        movedOfferIds: moved.map((offer) => offer.id),
        collapsedCandidateIds: collapsed.map((row) => row.id),
      },
    });

    return {
      candidateId: candidate.id,
      decision: "confirmed" as const,
      keptListingId: input.keepListingId,
      mergedListingId: losingListingId,
      movedOfferCount: moved.length,
      closedCandidateCount: collapsed.length,
    };
  });

  /*
   * After the commit. The keeper's canonical row is composed again because it now has an offer
   * it did not have a moment ago, and the emptied listing's document is dropped by the same
   * call because it is no longer published.
   */
  await resolveCanonicalListings(db, [result.keptListingId]);
  await rebuildSearchReadModelsAfterSync(db, {
    listingIds: [result.keptListingId, result.mergedListingId],
  });

  return result;
}

/**
 * Moves every offer of one listing onto another, with the rows that hang off them.
 *
 * Refuses rather than half-moves when the destination already sells through the same vendor:
 * `listing_offer` is unique on (listing_id, provider_id) precisely so one provider's two
 * records cannot bid against each other, and a pair that would break it is not two providers
 * selling one yacht — it is a mis-proposed pair.
 */
async function moveOffers(
  tx: DatabaseExecutor,
  fromListingId: string,
  toListingId: string,
): Promise<{ id: string }[]> {
  const clash = await tx.execute<{ count: number }>(sql`
    select count(*)::int as count
    from listing_offer moving
    join listing_offer staying
      on staying.listing_id = ${toListingId}
     and staying.provider_id = moving.provider_id
    where moving.listing_id = ${fromListingId}
  `);

  if (Number(clash.rows[0]?.count ?? 0) > 0) {
    throw new ORPCError("CONFLICT", {
      message: "Both listings are sold through the same provider, so they are not one yacht",
      data: { code: "MERGE_SAME_PROVIDER" },
    });
  }

  const moved = await tx
    .update(listingOffer)
    .set({ listingId: toListingId })
    .where(eq(listingOffer.listingId, fromListingId))
    .returning({ id: listingOffer.id });

  if (moved.length === 0) return moved;

  const offerIds = moved.map((offer) => offer.id);
  for (const table of OFFER_CHILD_TABLES) {
    await tx.execute(sql`
      update ${sql.raw(table)}
      set listing_id = ${toListingId}
      where listing_offer_id in ${offerIds}
    `);
  }

  return moved;
}

/**
 * What the matcher gets right, per rule and confidence band.
 *
 * The number auto-approval turns on, and the queue's own counts cannot answer it: they say how
 * much work is left, not how often the proposal was correct. A bucket only earns a rate once a
 * human has decided something in it, and `undone` counts the confirmations a split reversed —
 * a merge that had to be taken apart is a wrong answer however confidently it was proposed.
 *
 * Deferred pairs are outside the denominator on purpose. They are the ones nobody could call,
 * and counting them against a rule would understate it on the cases it does settle.
 */
export async function duplicateMatchMetrics(db: Database): Promise<Metrics> {
  const rows = await db.execute<{
    matchedOn: string;
    band: ConfidenceBand;
    proposed: number;
    confirmed: number;
    rejected: number;
    deferred: number;
    pending: number;
    undone: number;
  }>(sql`
    with bucketed as (
      select
        coalesce(d.signals ->> 'matchedOn', 'unscored') as "matchedOn",
        case
          when d.confidence is null then 'unknown'
          when d.confidence >= ${HIGH_CONFIDENCE} then 'high'
          when d.confidence >= ${MEDIUM_CONFIDENCE} then 'medium'
          else 'low'
        end as band,
        d.decision,
        ${undoneExpression} as undone
      from listing_duplicate_candidate d
    )
    select
      "matchedOn",
      band,
      count(*)::int as proposed,
      count(*) filter (where decision = 'confirmed')::int as confirmed,
      count(*) filter (where decision = 'rejected')::int as rejected,
      count(*) filter (where decision = 'deferred')::int as deferred,
      count(*) filter (where decision = 'pending')::int as pending,
      count(*) filter (where decision = 'confirmed' and undone)::int as undone
    from bucketed
    group by "matchedOn", band
    order by "matchedOn", band
  `);

  const measured = rows.rows.map((row) => {
    /* A split undoes a confirmation, so it counts against the rule rather than for it. */
    const right = row.confirmed - row.undone;
    const decided = right + row.rejected + row.undone;
    return {
      ...row,
      precision: decided === 0 ? null : Math.round((right / decided) * 10_000) / 10_000,
    };
  });

  return {
    rows: measured,
    decided: measured.reduce((total, row) => total + row.confirmed + row.rejected, 0),
  };
}

/**
 * Takes one offer back out of a listing, which is how a merge is undone.
 *
 * A merge is a claim that two vendors are selling one hull, and claims are sometimes wrong.
 * Splitting returns the offer to the listing it was merged out of where that listing is still
 * there — its slug, its URL and its reviews come back with it — and gives it a new one
 * otherwise.
 *
 * Bookings follow the offer rather than blocking the split. The vendor holding a reservation
 * is holding *this* boat, so leaving the booking pointed at a listing the offer has left would
 * describe a charter of something else.
 *
 * The source is stamped `rejected` so the next sync does not re-propose the pair, and the
 * candidate row keeps its own `confirmed`: the merge did happen, and the record of a decision
 * is not improved by pretending otherwise.
 */
export async function splitListingOffer(
  db: Database,
  actorUserId: string,
  input: SplitInput,
): Promise<SplitResult> {
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [offer] = await tx
      .select({
        id: listingOffer.id,
        listingId: listingOffer.listingId,
        listingSourceId: listingOffer.listingSourceId,
        title: listingOffer.title,
        operatorId: listingOffer.operatorId,
        homeBaseId: listingOffer.homeBaseId,
      })
      .from(listingOffer)
      .where(eq(listingOffer.id, input.listingOfferId))
      .for("update")
      .limit(1);

    if (!offer) throw new ORPCError("NOT_FOUND", { message: "Unknown offer" });

    const siblings = await tx
      .select({ total: count() })
      .from(listingOffer)
      .where(eq(listingOffer.listingId, offer.listingId));

    if ((siblings[0]?.total ?? 0) < 2) {
      throw new ORPCError("CONFLICT", {
        message: "This listing has only one offer, so there is nothing to split off",
        data: { code: "NOTHING_TO_SPLIT" },
      });
    }

    const origin = await findMergedOrigin(tx, offer.listingId, offer.listingSourceId);
    const target = origin ?? (await createListingForOffer(tx, offer));

    await tx.update(listingOffer).set({ listingId: target }).where(eq(listingOffer.id, offer.id));

    for (const table of OFFER_CHILD_TABLES) {
      await tx.execute(sql`
        update ${sql.raw(table)}
        set listing_id = ${target}
        where listing_offer_id = ${offer.id}
      `);
    }

    await tx
      .update(listingSource)
      .set({
        listingId: target,
        matchStatus: "rejected",
        matchedBy: `admin:${actorUserId}`,
        matchedAt: now,
      })
      .where(eq(listingSource.id, offer.listingSourceId));

    const bookings = await tx.execute<{ id: string }>(sql`
      update booking set listing_id = ${target}
      where listing_offer_id = ${offer.id} and listing_id <> ${target}
      returning id
    `);

    await tx.execute(sql`
      update quote set listing_id = ${target}
      where listing_offer_id = ${offer.id} and listing_id <> ${target}
    `);

    if (origin) {
      await tx
        .update(listing)
        .set({ status: "published", mergedIntoListingId: null })
        .where(eq(listing.id, origin));
    }

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "listing",
      entityId: target,
      before: { listingOfferId: offer.id, listingId: offer.listingId, note: input.note ?? null },
      after: {
        split: true,
        listingOfferId: offer.id,
        listingId: target,
        restoredOrigin: origin !== null,
        movedBookingIds: bookings.rows.map((row) => row.id),
      },
    });

    return {
      listingOfferId: offer.id,
      listingId: target,
      restoredOrigin: origin !== null,
      movedBookingCount: bookings.rows.length,
      previousListingId: offer.listingId,
    };
  });

  await resolveCanonicalListings(db, [result.listingId, result.previousListingId]);
  await rebuildSearchReadModelsAfterSync(db, {
    listingIds: [result.listingId, result.previousListingId],
  });

  return {
    listingOfferId: result.listingOfferId,
    listingId: result.listingId,
    restoredOrigin: result.restoredOrigin,
    movedBookingCount: result.movedBookingCount,
  };
}

/**
 * The listing this offer was merged out of, if it is still standing and still empty.
 *
 * Returning an offer to its own listing keeps the URL, the slug and the reviews that went with
 * it. A `merged` listing that has since acquired offers of its own is not that listing any
 * more, so it is left alone and the offer gets a new one.
 */
async function findMergedOrigin(
  tx: DatabaseExecutor,
  currentListingId: string,
  listingSourceId: string,
): Promise<string | null> {
  const rows = await tx.execute<{ id: string }>(sql`
    select l.id
    from listing l
    where l.merged_into_listing_id = ${currentListingId}
      and l.status = 'merged'
      and not exists (select 1 from listing_offer o where o.listing_id = l.id)
      and exists (
        select 1 from audit_log a
        where a.action = 'merge'
          and a.after ->> 'mergedListingId' = l.id
          and a.before -> 'sourceIds' @> ${JSON.stringify([{ id: listingSourceId }])}::jsonb
      )
    limit 1
  `);

  return rows.rows[0]?.id ?? null;
}

/** A listing of its own for an offer with nowhere to return to. */
async function createListingForOffer(
  tx: DatabaseExecutor,
  offer: {
    id: string;
    title: string | null;
    operatorId: string | null;
    homeBaseId: string | null;
  },
): Promise<string> {
  if (!offer.operatorId || !offer.homeBaseId) {
    throw new ORPCError("CONFLICT", {
      message: "This offer names no operator or base, so it cannot stand on its own listing",
      data: { code: "OFFER_INCOMPLETE" },
    });
  }

  const id = `ylst_split_${offer.id}`;
  await tx
    .insert(listing)
    .values({
      id,
      /* Unique by construction: one split listing per offer, and an offer splits once. */
      slug: `${slugify(offer.title ?? "yacht")}-${offer.id.slice(-8)}`,
      title: offer.title ?? "",
      operatorId: offer.operatorId,
      homeBaseId: offer.homeBaseId,
      status: "published",
    })
    .onConflictDoNothing();

  return id;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "yacht"
  );
}

/**
 * The listing-level rows a customer would otherwise lose sight of.
 *
 * Reviews are about the boat, not about who sold it, so they follow. A wishlist entry follows
 * only where the same wishlist does not already hold the survivor; the duplicate is dropped,
 * because "saved twice" was only ever an artefact of the catalogue showing one yacht twice.
 */
async function carryListingReferences(
  tx: DatabaseExecutor,
  fromListingId: string,
  toListingId: string,
): Promise<void> {
  await tx.execute(sql`
    update review set listing_id = ${toListingId} where listing_id = ${fromListingId}
  `);

  await tx.execute(sql`
    update wishlist_item w
    set listing_id = ${toListingId}
    where w.listing_id = ${fromListingId}
      and not exists (
        select 1 from wishlist_item held
        where held.wishlist_id = w.wishlist_id and held.listing_id = ${toListingId}
      )
  `);

  await tx.execute(sql`
    delete from wishlist_item where listing_id = ${fromListingId}
  `);
}

/**
 * Records that the pair is not the same yacht: the candidate closes, and both
 * listings stay exactly where they are.
 *
 * The verdict stops at the pair. `listing_source.match_status` is a property of the
 * source, and one listing takes part in as many pairs as it has look-alikes — up to
 * 26 of them here — so stamping the sources `rejected` labelled a boat rejected in
 * every other pair nobody had looked at yet. Nothing needed that stamp: the
 * candidate row is what stops the writer re-proposing the pair, and the auto-matcher
 * only ever links sources from the same provider, so it could not merge these two
 * on its own regardless.
 */
export async function rejectDuplicateCandidate(
  db: Database,
  actorUserId: string,
  input: { candidateId: string; note?: string },
): Promise<Resolution> {
  return closeCandidate(db, actorUserId, input, "rejected");
}

/**
 * "I looked and I cannot tell." Neither of the other two verdicts, and kept apart from both.
 *
 * The precision that will one day justify auto-approval is confirmed over confirmed-plus-
 * rejected, so filing every hard pair as a rejection would sink the figure the decision rests
 * on. A deferred pair leaves the queue and stays decidable: the note says what stopped the
 * reviewer, and whoever answers that question later resolves it from the Deferred tab.
 */
export async function deferDuplicateCandidate(
  db: Database,
  actorUserId: string,
  input: { candidateId: string; note?: string },
): Promise<Resolution> {
  return closeCandidate(db, actorUserId, input, "deferred");
}

/**
 * Puts a reviewed pair back in the queue, undecided.
 *
 * Every verdict on this screen was reversible in spirit and none of them were in practice: a
 * rejection was final, a set-aside pair was final, and a merge could be split without the pair
 * ever coming back to be judged again. Nothing re-proposes a candidate — the row is unique per
 * pair, so the sync cannot offer it a second time — which made "reviewed" mean "gone".
 *
 * The reviewer, the note and the timestamp go with the verdict: what is left is the proposal
 * as the matcher made it, which is what the queue is for. The audit row keeps the history.
 *
 * A standing merge is the one thing this will not undo. The offers have moved and bookings
 * point at the survivor; taking the pair apart is `splitListingOffer`'s job, and only once it
 * has run does the confirmation become reopenable.
 */
export async function reopenDuplicateCandidate(
  db: Database,
  actorUserId: string,
  input: { candidateId: string },
): Promise<Resolution> {
  return db.transaction(async (tx) => {
    const candidate = await lockReopenableCandidate(tx, input.candidateId);

    await tx
      .update(listingDuplicateCandidate)
      .set({ decision: "pending", reviewer: null, reviewerNote: null, reviewedAt: null })
      .where(eq(listingDuplicateCandidate.id, candidate.id));

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "listing_duplicate_candidate",
      entityId: candidate.id,
      before: { decision: candidate.decision, reviewerNote: candidate.reviewerNote },
      after: { decision: "pending", sourceIds: [candidate.sourceAId, candidate.sourceBId] },
    });

    return {
      candidateId: candidate.id,
      decision: "pending",
      keptListingId: null,
      mergedListingId: null,
      movedOfferCount: 0,
      closedCandidateCount: 0,
    };
  });
}

/**
 * The candidates that can go back to undecided: anything already reviewed, except a
 * confirmation whose merge is still standing.
 *
 * Read under the same `for update` lock as the write it guards, so a reopen racing a split
 * cannot see a merge that is halfway apart.
 */
async function lockReopenableCandidate(tx: DatabaseExecutor, candidateId: string) {
  const [candidate] = await tx
    .select()
    .from(listingDuplicateCandidate)
    .where(eq(listingDuplicateCandidate.id, candidateId))
    .limit(1)
    .for("update");

  if (!candidate) throw new ORPCError("NOT_FOUND", { message: "Unknown duplicate candidate" });
  if (candidate.decision === "pending") {
    throw new ORPCError("CONFLICT", { message: "This candidate is already in the queue" });
  }
  if (candidate.decision !== "confirmed") return candidate;

  const sources = await tx
    .select({ id: listingSource.id, listingId: listingSource.listingId })
    .from(listingSource)
    .where(inArray(listingSource.id, [candidate.sourceAId, candidate.sourceBId]));

  const [first, second] = sources;
  if (sources.length === 2 && first !== undefined && second !== undefined) {
    if (first.listingId !== second.listingId) return candidate;
  }

  throw new ORPCError("CONFLICT", {
    message: "Take the merged offer back out of the listing before reopening this pair",
  });
}

async function closeCandidate(
  db: Database,
  actorUserId: string,
  input: { candidateId: string; note?: string },
  decision: "rejected" | "deferred",
): Promise<Resolution> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const candidate = await lockDecidableCandidate(tx, input.candidateId);

    await tx
      .update(listingDuplicateCandidate)
      .set({
        decision,
        reviewer: actorUserId,
        reviewerNote: input.note ?? null,
        reviewedAt: now,
      })
      .where(eq(listingDuplicateCandidate.id, candidate.id));

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "listing_duplicate_candidate",
      entityId: candidate.id,
      before: { decision: candidate.decision },
      after: { decision, sourceIds: [candidate.sourceAId, candidate.sourceBId] },
    });

    return {
      candidateId: candidate.id,
      decision,
      keptListingId: null,
      mergedListingId: null,
      movedOfferCount: 0,
      closedCandidateCount: 0,
    };
  });
}

/**
 * The candidates a verdict may still be written to: anything undecided, a pair set aside for
 * later, plus a confirmation whose merge a split has since taken apart.
 *
 * `for update` plus the decision check inside the transaction: without the lock a
 * double-clicked Confirm runs the merge twice, and the second run hides the
 * listing the first one kept.
 */
async function lockDecidableCandidate(tx: DatabaseExecutor, candidateId: string) {
  const [candidate] = await tx
    .select()
    .from(listingDuplicateCandidate)
    .where(eq(listingDuplicateCandidate.id, candidateId))
    .limit(1)
    .for("update");

  if (!candidate) throw new ORPCError("NOT_FOUND", { message: "Unknown duplicate candidate" });
  /*
   * `deferred` is not a verdict — it is a reviewer saying "not now", and the only way back to
   * the pair is this row, since nothing re-proposes a candidate that already exists. Closing it
   * to a later decision made Set aside the most final button on the card.
   */
  if (candidate.decision === "pending" || candidate.decision === "deferred") return candidate;

  /*
   * A confirmation a split has already taken apart is open again. Without this an
   * accidental `Take out of this listing` is permanent: the pair never returns to the
   * queue, and nothing re-proposes it — splitting stamps its sources `rejected` so the
   * nightly matcher leaves them alone, and the pair is unique in this table, so it cannot
   * be proposed a second time either.
   *
   * Read inside the same locked transaction as the verdict it guards, so a split racing a
   * re-merge cannot both pass.
   */
  if (candidate.decision === "confirmed") {
    const sources = await tx
      .select({ id: listingSource.id, listingId: listingSource.listingId })
      .from(listingSource)
      .where(inArray(listingSource.id, [candidate.sourceAId, candidate.sourceBId]));

    const [first, second] = sources;
    if (sources.length === 2 && first !== undefined && second !== undefined) {
      if (first.listingId !== second.listingId) return candidate;
    }
  }

  throw new ORPCError("CONFLICT", { message: "This candidate has already been reviewed" });
}
