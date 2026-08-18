import { ORPCError } from "@orpc/server";
import { base, location } from "@yacht-charter/db/schema/geography";
import { listing, listingMedia, listingSpecification } from "@yacht-charter/db/schema/listing";
import { listingDuplicateCandidate, listingSource } from "@yacht-charter/db/schema/listing-source";
import { operator } from "@yacht-charter/db/schema/operator";
import { provider, providerRecord } from "@yacht-charter/db/schema/provider";
import { yachtModel } from "@yacht-charter/db/schema/taxonomy";
import { rebuildSearchReadModelsAfterSync } from "@yacht-charter/db/search/read-model";
import { count, desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";

import type { Database, DatabaseExecutor } from "../context";
import { duplicateSignalsSchema } from "../contracts/admin";
import type {
  duplicateCandidateSchema,
  duplicateConfirmInputSchema,
  duplicateQueueInputSchema,
  duplicateQueueSchema,
  duplicateResolutionSchema,
  duplicateSideSchema,
} from "../contracts/admin";
import { writeAuditLog } from "./audit";
import { paginatedQuery, totalFrom } from "./pagination";

type QueueInput = z.infer<typeof duplicateQueueInputSchema>;
type QueueResult = z.infer<typeof duplicateQueueSchema>;
type Candidate = z.infer<typeof duplicateCandidateSchema>;
type Side = z.infer<typeof duplicateSideSchema>;
type ConfirmInput = z.infer<typeof duplicateConfirmInputSchema>;
type Resolution = z.infer<typeof duplicateResolutionSchema>;

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

export async function listDuplicateCandidates(
  db: Database,
  input: QueueInput,
): Promise<QueueResult> {
  const where = eq(listingDuplicateCandidate.decision, input.decision);

  const { rows, pagination } = await paginatedQuery({
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
  });

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

  return { items, pagination };
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
  const images = await loadPrimaryImages(db, listingIds);

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
                primaryImageUrl: images.get(row.listingId) ?? null,
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
