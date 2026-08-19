import { listingPricePeriod } from "@yacht-charter/db/schema/availability";
import { MAX_MONEY_MINOR } from "@yacht-charter/db/schema/_shared";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { providerRecord } from "@yacht-charter/db/schema/provider";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "../registry";
import { chunked, ROW_CHUNK } from "../shared/chunks";

/**
 * The provider's published rates, written on the catalogue's cadence.
 *
 * This used to run inside the hourly availability sync, because that is where the
 * prices were needed: a synthesized free period is more useful with a price on it.
 * But the rates themselves are catalogue data - a vendor publishes a season's price
 * list and leaves it alone - and the volume made the mismatch expensive. A full
 * Booking Manager sweep is 52 weeks per yacht per year, so on a real fleet the
 * hourly run was rewriting on the order of a million `listing_price_period` rows to
 * restate figures that had not moved since the night before.
 *
 * Nothing downstream changed: the rows land in the same table with the same conflict
 * behaviour, and a card still quotes "from" off them. They are simply refreshed once
 * a day with the rest of the catalogue instead of once an hour.
 */

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO yyyy-MM-dd date");

/** Catalogue price, valid for a date range rather than for one booking. */
export const seasonalPriceSchema = z.object({
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
});
export type SeasonalPrice = z.infer<typeof seasonalPriceSchema>;

/**
 * A provider that can publish a price list. Optional: a vendor may have no
 * catalogue-wide price dump at all, in which case its listings carry no seasonal
 * rates and the quote path is the only thing that prices them.
 */
export interface SeasonalPriceProvider {
  loadSeasonalPrices(listingIds: string[]): Promise<Map<string, SeasonalPrice[]>>;
}

export function supportsSeasonalPrices<T extends object>(
  provider: T,
): provider is T & SeasonalPriceProvider {
  return "loadSeasonalPrices" in provider;
}

export interface PricePeriodWrite {
  listingId: string;
  listingSourceId: string | null;
  prices: readonly SeasonalPrice[];
}

export interface PricePeriodRow {
  listingId: string;
  listingSourceId: string | null;
  startDate: string;
  endDate: string;
  /**
   * The loaders map WEEKLY lists only; NauSYS publishes dailies separately and a
   * weekly rate is not a seventh of one, so they cannot be folded together here.
   */
  kind: "weekly";
  priceMinor: number;
  currency: string;
}

/**
 * A yacht can appear in more than one price list, and the same period then arrives
 * twice. Postgres refuses an `ON CONFLICT` that would touch one row twice in a
 * single statement, so the batch is deduplicated on the conflict target before it
 * is sent.
 *
 * The key is that conflict target, listing included. Batching across the whole fleet
 * is what makes the listing leg load-bearing: keyed on the period alone, two boats
 * priced for the same week would collapse into one row and the second would silently
 * lose its price.
 */
export interface PricePeriodRows {
  rows: PricePeriodRow[];
  /** Rates too large for the column, which are left unwritten and reported. */
  rejected: number;
}

export function dedupePricePeriodRows(writes: readonly PricePeriodWrite[]): PricePeriodRows {
  const unique = new Map<string, PricePeriodRow>();
  let rejected = 0;

  for (const write of writes) {
    for (const price of write.prices) {
      if (!Number.isSafeInteger(price.priceMinor) || Math.abs(price.priceMinor) > MAX_MONEY_MINOR) {
        rejected += 1;
        continue;
      }
      unique.set(`${write.listingId}|${price.startDate}|${price.endDate}`, {
        listingId: write.listingId,
        listingSourceId: write.listingSourceId,
        startDate: price.startDate,
        endDate: price.endDate,
        kind: "weekly",
        priceMinor: price.priceMinor,
        currency: price.currency,
      });
    }
  }

  return { rows: [...unique.values()], rejected };
}

export interface PricePeriodStore {
  /** The provider's active source link per listing, so a row can be attributed. */
  loadSourceIds(listingIds: readonly string[]): Promise<Map<string, string | null>>;
  /** Returns the number of distinct periods written. */
  writePricePeriods(writes: readonly PricePeriodWrite[]): Promise<number>;
}

export interface WriteSeasonalPricesOptions {
  store: PricePeriodStore;
  /** The listings this catalogue run refreshed; nothing else is repriced. */
  listingIds: readonly string[];
  loadSeasonalPrices(listingIds: string[]): Promise<Map<string, SeasonalPrice[]>>;
}

export async function writeSeasonalPrices(options: WriteSeasonalPricesOptions): Promise<number> {
  const listingIds = [...new Set(options.listingIds)];
  if (listingIds.length === 0) return 0;

  const [prices, sourceIds] = await Promise.all([
    options.loadSeasonalPrices(listingIds),
    options.store.loadSourceIds(listingIds),
  ]);

  const writes: PricePeriodWrite[] = [];
  for (const listingId of listingIds) {
    const listingPrices = prices.get(listingId);
    // A listing the provider published no rates for keeps whatever it has rather
    // than being emptied: absent is not the same statement as "no longer priced",
    // and only the vendor can make the second one.
    if (!listingPrices?.length) continue;
    writes.push({
      listingId,
      listingSourceId: sourceIds.get(listingId) ?? null,
      prices: listingPrices,
    });
  }

  return options.store.writePricePeriods(writes);
}

export function createDrizzlePricePeriodStore(options: {
  db: Database;
  providerId: string;
}): PricePeriodStore {
  const { db, providerId } = options;

  return {
    async loadSourceIds(listingIds) {
      const found = new Map<string, string | null>();
      if (listingIds.length === 0) return found;

      for (const chunk of chunked(listingIds)) {
        const rows = await db
          .select({ listingId: listingSource.listingId, listingSourceId: listingSource.id })
          .from(listingSource)
          .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
          .where(
            and(
              eq(providerRecord.providerId, providerId),
              eq(providerRecord.active, true),
              inArray(listingSource.listingId, [...chunk]),
              isNotNull(listingSource.listingId),
            ),
          );

        for (const row of rows) {
          if (row.listingId) found.set(row.listingId, row.listingSourceId);
        }
      }

      return found;
    },

    async writePricePeriods(writes) {
      const { rows, rejected } = dedupePricePeriodRows(writes);
      if (rejected > 0) {
        // Printed rather than thrown: it is a vendor data problem, one boat wide, and
        // the run has thousands of other listings whose rates are fine.
        console.warn(
          `[prices] dropped ${rejected} rate(s) too large for price_minor; those periods keep their previous price`,
        );
      }
      if (rows.length === 0) return 0;

      for (const chunk of chunked(rows, ROW_CHUNK)) {
        await db
          .insert(listingPricePeriod)
          .values(chunk)
          .onConflictDoUpdate({
            target: [
              listingPricePeriod.listingId,
              listingPricePeriod.kind,
              listingPricePeriod.startDate,
              listingPricePeriod.endDate,
            ],
            set: {
              priceMinor: sql`excluded.price_minor`,
              currency: sql`excluded.currency`,
              updatedAt: sql`now()`,
            },
          });
      }

      return rows.length;
    },
  };
}
