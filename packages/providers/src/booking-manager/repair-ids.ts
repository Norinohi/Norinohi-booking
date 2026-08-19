import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { provider, providerRecord } from "@yacht-charter/db/schema/provider";
import { and, eq, inArray } from "drizzle-orm";

import { ContractError } from "../shared/errors";
import type { Database } from "../registry";
import { BookingManagerClient } from "./client";
import type { BookingManagerConfig } from "./config";
import { resolveBookingManagerConfig } from "./config";
import { bookingManagerEndpoints, restIdListSchema } from "./endpoints";

/**
 * One-off repair of ids this connector rounded before it knew better.
 *
 * Until `parseExactJson` landed, Booking Manager responses went through plain
 * `JSON.parse`, which holds 15-16 digits of a value the vendor writes with up to 19.
 * Every id we stored past that bound is a rounded approximation:
 * `6614004890000100225` was recorded as `6614004890000100000`. Measured on the live
 * account, 163 of 368 `/yachts` ids and 197,615 of 239,442 occupancy `yachtId` values
 * do not survive the round trip.
 *
 * It stayed invisible because both sides of every local comparison rounded the same
 * way, so records matched each other and availability resolved. What did not work was
 * talking to the vendor: `toPositiveIntId` refuses anything past 2^53, so quoting and
 * booking failed outright for those yachts.
 *
 * Without this repair the next catalogue sync would read exact ids, match none of the
 * stored ones, and mint a duplicate draft listing for every affected yacht while
 * retiring the originals - taking their slugs and any human match verdict with them.
 *
 * The mapping is recoverable because rounding is deterministic and, on real data,
 * injective: 11,672 distinct yacht ids produce 11,672 distinct rounded forms. Where
 * that does not hold this refuses to guess.
 */

export interface RepairIdsOptions {
  db: Database;
  config?: BookingManagerConfig;
  client?: BookingManagerClient;
  /** Report what would change without writing. */
  dryRun?: boolean;
}

export interface RepairIdsReport {
  dryRun: boolean;
  /** Exact ids fetched from the vendor, per resource type. */
  vendorIds: Record<"yacht" | "base", number>;
  providerRecordsRepaired: number;
  listingSourceYachtIdsRepaired: number;
  listingSourceBaseIdsRepaired: number;
  /** Already exact; nothing to do. */
  alreadyExact: number;
  /**
   * Stored ids matching no vendor id, rounded or exact. A yacht the vendor has since
   * dropped, most likely. Left alone: the ordinary retire sweep owns that decision.
   */
  unmatched: string[];
}

const ROUNDS_TO = (exact: string) => String(Number(exact));

const REPAIR_TIMEOUT_MS = 300_000;

/**
 * Rounded form to exact id. Throws rather than pick a winner: two yachts sharing a
 * rounded form means the stored value cannot say which one it was, and quietly
 * choosing would point a listing at the wrong boat.
 */
export function buildExactIdIndex(exactIds: readonly string[]): Map<string, string> {
  const index = new Map<string, string>();
  const collisions = new Map<string, string[]>();

  for (const exact of exactIds) {
    const rounded = ROUNDS_TO(exact);
    const seen = index.get(rounded);
    if (seen !== undefined && seen !== exact) {
      collisions.set(rounded, [...(collisions.get(rounded) ?? [seen]), exact]);
      continue;
    }
    index.set(rounded, exact);
  }

  if (collisions.size > 0) {
    const sample = [...collisions.entries()]
      .slice(0, 3)
      .map(([rounded, group]) => `${rounded} <- ${group.join(", ")}`)
      .join("; ");
    throw new ContractError(
      `Cannot repair Booking Manager ids: ${collisions.size} rounded forms are ambiguous (${sample})`,
    );
  }

  return index;
}

/** The exact id for a stored one, or null when it is already exact or unknown. */
export function exactIdFor(
  stored: string,
  index: Map<string, string>,
  exactSet: Set<string>,
): string | null {
  if (exactSet.has(stored)) return null;
  const exact = index.get(stored);
  return exact !== undefined && exact !== stored ? exact : null;
}

export async function repairBookingManagerIds(options: RepairIdsOptions): Promise<RepairIdsReport> {
  const { db } = options;
  const config = options.config ?? resolveBookingManagerConfig();
  /*
   * A longer timeout than the syncs use. This asks for every yacht and every base in
   * one go, which on a real credential is tens of megabytes - well past the 30s the
   * ordinary calls are tuned for. It runs once, by hand, so waiting is free; splitting
   * it per company would be ~1300 calls to answer a question one call answers.
   */
  const client =
    options.client ??
    new BookingManagerClient({
      config: { ...config, timeoutMs: Math.max(config.timeoutMs, REPAIR_TIMEOUT_MS) },
    });
  const dryRun = options.dryRun ?? false;

  const [row] = await db
    .select({ id: provider.id })
    .from(provider)
    .where(eq(provider.code, "booking_manager"))
    .limit(1);
  if (!row) {
    throw new ContractError("No booking_manager provider row; nothing to repair");
  }
  const providerId = row.id;

  // Account-wide on purpose. A repair narrowed to the current allowlist would leave
  // rows a previous, wider import wrote still rounded, and those are exactly the
  // records that would duplicate on the next sync.
  const bases = await client.get(bookingManagerEndpoints.bases, restIdListSchema);
  const yachts = await client.get(bookingManagerEndpoints.yachts, restIdListSchema);

  const yachtIds = yachts.map((yacht) => yacht.id);
  const baseIds = bases.map((base) => base.id);

  const yachtIndex = buildExactIdIndex(yachtIds);
  const baseIndex = buildExactIdIndex(baseIds);
  const yachtSet = new Set(yachtIds);
  const baseSet = new Set(baseIds);

  const report: RepairIdsReport = {
    dryRun,
    vendorIds: { yacht: yachtIds.length, base: baseIds.length },
    providerRecordsRepaired: 0,
    listingSourceYachtIdsRepaired: 0,
    listingSourceBaseIdsRepaired: 0,
    alreadyExact: 0,
    unmatched: [],
  };

  const indexFor = (resourceType: string) =>
    resourceType === "base"
      ? ({ index: baseIndex, set: baseSet } as const)
      : ({ index: yachtIndex, set: yachtSet } as const);

  // provider_record.external_id
  const records = await db
    .select({
      id: providerRecord.id,
      resourceType: providerRecord.resourceType,
      externalId: providerRecord.externalId,
    })
    .from(providerRecord)
    .where(
      and(
        eq(providerRecord.providerId, providerId),
        inArray(providerRecord.resourceType, ["yacht", "base"]),
      ),
    );

  for (const record of records) {
    const { index, set } = indexFor(record.resourceType);
    if (set.has(record.externalId)) {
      report.alreadyExact += 1;
      continue;
    }
    const exact = exactIdFor(record.externalId, index, set);
    if (exact === null) {
      report.unmatched.push(`${record.resourceType}:${record.externalId}`);
      continue;
    }
    report.providerRecordsRepaired += 1;
    if (!dryRun) {
      await db
        .update(providerRecord)
        .set({ externalId: exact })
        .where(eq(providerRecord.id, record.id));
    }
  }

  // listing_source's own copies of the same ids.
  const sources = await db
    .select({
      id: listingSource.id,
      externalYachtId: listingSource.externalYachtId,
      externalBaseId: listingSource.externalBaseId,
      providerRecordId: listingSource.providerRecordId,
    })
    .from(listingSource)
    .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
    .where(eq(providerRecord.providerId, providerId));

  for (const source of sources) {
    const nextYachtId = exactIdFor(source.externalYachtId, yachtIndex, yachtSet);
    const nextBaseId =
      source.externalBaseId === null ? null : exactIdFor(source.externalBaseId, baseIndex, baseSet);

    if (nextYachtId === null && nextBaseId === null) continue;

    const patch: Partial<typeof listingSource.$inferInsert> = {};
    if (nextYachtId !== null) {
      patch.externalYachtId = nextYachtId;
      report.listingSourceYachtIdsRepaired += 1;
    }
    if (nextBaseId !== null) {
      patch.externalBaseId = nextBaseId;
      report.listingSourceBaseIdsRepaired += 1;
    }
    if (!dryRun) {
      await db.update(listingSource).set(patch).where(eq(listingSource.id, source.id));
    }
  }

  // Kept short: a long tail of retired yachts is normal and should not bury the counts.
  report.unmatched = report.unmatched.slice(0, 20);
  return report;
}
