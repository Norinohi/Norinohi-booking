import { ORPCError } from "@orpc/server";
import { base, location } from "@yacht-charter/db/schema/geography";
import {
  listing,
  listingAmenity,
  listingMedia,
  listingSpecification,
} from "@yacht-charter/db/schema/listing";
import { listingText } from "@yacht-charter/db/schema/listing-text";
import { listingDuplicateCandidate, listingSource } from "@yacht-charter/db/schema/listing-source";
import { operator } from "@yacht-charter/db/schema/operator";
import { provider, providerRecord } from "@yacht-charter/db/schema/provider";
import { amenity, builder, yachtCategory, yachtModel } from "@yacht-charter/db/schema/taxonomy";
import { rebuildSearchReadModelsAfterSync } from "@yacht-charter/db/search/read-model";
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
          .orderBy(
            desc(listingDuplicateCandidate.confidence),
            desc(listingDuplicateCandidate.createdAt),
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

  const sides = await loadSides(
    db,
    rows.flatMap((row) => [row.sourceAId, row.sourceBId]),
  );

  const items: Candidate[] = rows.map((row) => ({
    id: row.id,
    decision: row.decision,
    confidence: row.confidence === null ? null : Number(row.confidence),
    signals: duplicateSignalsSchema.safeParse(row.signals).data ?? null,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
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

  const decisionCounts = { pending: 0, confirmed: 0, rejected: 0 };
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
 * the catalogue writer refuses to overwrite on the next sync.
 */
export async function confirmDuplicateCandidate(
  db: Database,
  actorUserId: string,
  input: ConfirmInput,
): Promise<Resolution> {
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const candidate = await lockPendingCandidate(tx, input.candidateId);

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

    const moved = losingListingId
      ? await tx
          .update(listingSource)
          .set({ listingId: input.keepListingId })
          .where(eq(listingSource.listingId, losingListingId))
          .returning({ id: listingSource.id })
      : [];

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
      .set({ decision: "confirmed", reviewer: actorUserId, reviewedAt: now })
      .where(eq(listingDuplicateCandidate.id, candidate.id));

    if (losingListingId) {
      await tx.update(listing).set({ status: "hidden" }).where(eq(listing.id, losingListingId));
    }

    await writeAuditLog(tx, {
      actorUserId,
      action: "merge",
      entityType: "listing",
      entityId: input.keepListingId,
      // Both ids and the moved sources, so the merge can be undone by hand.
      before: {
        candidateId: candidate.id,
        decision: candidate.decision,
        listingIds: [...listingIds],
        sourceIds: sources.map((row) => ({ id: row.id, listingId: row.listingId })),
      },
      after: {
        keptListingId: input.keepListingId,
        hiddenListingId: losingListingId,
        movedSourceIds: moved.map((row) => row.id),
      },
    });

    return {
      candidateId: candidate.id,
      decision: "confirmed" as const,
      keptListingId: input.keepListingId,
      hiddenListingId: losingListingId,
      movedSourceCount: moved.length,
    };
  });

  // After the commit: the rebuild reads the merged state, and the loser's doc is
  // dropped by the same call because it is no longer published.
  await rebuildSearchReadModelsAfterSync(db, {
    listingIds: [result.keptListingId, ...(result.hiddenListingId ? [result.hiddenListingId] : [])],
  });

  return result;
}

/**
 * Records that the pair is not the same yacht. Both sources move to `rejected`,
 * which stops the writer re-proposing them and keeps each listing where it is.
 */
export async function rejectDuplicateCandidate(
  db: Database,
  actorUserId: string,
  candidateId: string,
): Promise<Resolution> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const candidate = await lockPendingCandidate(tx, candidateId);

    await tx
      .update(listingSource)
      .set({ matchStatus: "rejected", matchedBy: `admin:${actorUserId}`, matchedAt: now })
      .where(inArray(listingSource.id, [candidate.sourceAId, candidate.sourceBId]));

    await tx
      .update(listingDuplicateCandidate)
      .set({ decision: "rejected", reviewer: actorUserId, reviewedAt: now })
      .where(eq(listingDuplicateCandidate.id, candidate.id));

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "listing_duplicate_candidate",
      entityId: candidate.id,
      before: { decision: candidate.decision },
      after: {
        decision: "rejected",
        sourceIds: [candidate.sourceAId, candidate.sourceBId],
      },
    });

    return {
      candidateId: candidate.id,
      decision: "rejected" as const,
      keptListingId: null,
      hiddenListingId: null,
      movedSourceCount: 0,
    };
  });
}

/**
 * `for update` plus the decision check inside the transaction: without the lock a
 * double-clicked Confirm runs the merge twice, and the second run hides the
 * listing the first one kept.
 */
async function lockPendingCandidate(tx: DatabaseExecutor, candidateId: string) {
  const [candidate] = await tx
    .select()
    .from(listingDuplicateCandidate)
    .where(eq(listingDuplicateCandidate.id, candidateId))
    .limit(1)
    .for("update");

  if (!candidate) throw new ORPCError("NOT_FOUND", { message: "Unknown duplicate candidate" });
  if (candidate.decision !== "pending") {
    throw new ORPCError("CONFLICT", { message: "This candidate has already been reviewed" });
  }

  return candidate;
}
