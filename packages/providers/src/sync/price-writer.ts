import { listingPricePeriod } from "@yacht-charter/db/schema/availability";
import { listingOffer } from "@yacht-charter/db/schema/listing-offer";
import { MAX_MONEY_MINOR } from "@yacht-charter/db/schema/_shared";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { providerRecord } from "@yacht-charter/db/schema/provider";
import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { log } from "evlog";
import { z } from "zod";

import type { Database } from "../registry";
import { chunked } from "../shared/chunks";
import { runPooled } from "../shared/pooled";

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

/**
 * Rows per `listing_price_period` insert, well above the shared `ROW_CHUNK`.
 *
 * That constant is sized for the widest table in the sync at thirteen bound
 * parameters a row; this one binds eight, so Postgres's 65535 allows eight
 * thousand rather than five hundred. The difference is not academic here: a
 * Booking Manager sweep is a hundred-odd charter weeks for eleven thousand boats,
 * and at 500 a statement that is two thousand sequential round trips to restate a
 * price list the vendor has not touched since the night before.
 */
const PRICE_ROW_CHUNK = 4000;

/**
 * Chunks in flight at once. Deliberately short of the ten clients node-postgres
 * pools by default: the catalogue run's progress poller and its error recorder
 * each need one, and a writer that takes the pool to its ceiling makes them wait
 * on a price list.
 */
const PRICE_WRITE_CONCURRENCY = 4;

/**
 * Offers per prune statement. Their fresh weeks travel as one jsonb parameter, so this bounds
 * the statement's size rather than a bind-parameter count.
 */
const PRUNE_OFFER_CHUNK = 500;

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
export { type SeasonalPriceProvider, supportsSeasonalPrices } from "../provider";

/** Which offer a listing's rates belong to, and the source link behind it. */
export interface OfferRef {
  listingSourceId: string;
  listingOfferId: string;
}

export interface PricePeriodWrite {
  listingId: string;
  listingSourceId: string | null;
  listingOfferId: string;
  prices: readonly SeasonalPrice[];
}

export interface PricePeriodRow {
  listingId: string;
  listingSourceId: string | null;
  listingOfferId: string;
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
 * The key is that conflict target, offer included. Batching across the whole fleet is what
 * makes the offer leg load-bearing: keyed on the period alone, two boats priced for the same
 * week would collapse into one row and the second would silently lose its price. It is the
 * offer rather than the listing because a hull both vendors sell has two rates for one week,
 * and neither is the other's to overwrite.
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
      unique.set(`${write.listingOfferId}|${price.startDate}|${price.endDate}`, {
        listingId: write.listingId,
        listingSourceId: write.listingSourceId,
        listingOfferId: write.listingOfferId,
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

/** Weekly periods starting on or after `start` and before `end`. */
export interface PriceWindow {
  start: string;
  end: string;
}

export interface PricePeriodStore {
  /** The provider's active offer per listing, which is what a rate belongs to. */
  loadSourceIds(listingIds: readonly string[]): Promise<Map<string, OfferRef>>;
  /** Rows already through `dedupePricePeriodRows`; returns how many were written. */
  writePricePeriods(rows: readonly PricePeriodRow[]): Promise<number>;
  /**
   * Deletes every weekly period of these offers starting inside `window` that is not among the
   * `kept` rows just written, and returns how many went.
   */
  prunePricePeriods(
    offers: readonly OfferRef[],
    window: PriceWindow,
    kept: readonly PricePeriodRow[],
  ): Promise<number>;
}

export interface WriteSeasonalPricesOptions {
  store: PricePeriodStore;
  /** The listings this catalogue run refreshed; nothing else is repriced. */
  listingIds: readonly string[];
  loadSeasonalPrices(listingIds: string[]): Promise<Map<string, SeasonalPrice[]>>;
  /**
   * Where the loader's answer is the provider's whole price list, so a week it leaves out is a
   * week the provider no longer prices. Absent for a loader that cannot say so.
   */
  completeWithin?: PriceWindow;
}

export async function writeSeasonalPrices(options: WriteSeasonalPricesOptions): Promise<number> {
  const listingIds = [...new Set(options.listingIds)];
  if (listingIds.length === 0) return 0;

  const [prices, sourceIds] = await Promise.all([
    options.loadSeasonalPrices(listingIds),
    options.store.loadSourceIds(listingIds),
  ]);

  const writes: PricePeriodWrite[] = [];
  const answered: OfferRef[] = [];
  for (const listingId of listingIds) {
    const ref = sourceIds.get(listingId);
    if (ref) answered.push(ref);
    const listingPrices = prices.get(listingId);
    // Without `completeWithin`, a listing the provider published no rates for keeps
    // whatever it has rather than being emptied: absent is not the same statement as
    // "no longer priced", and only the vendor can make the second one.
    if (!listingPrices?.length) continue;
    /*
     * A rate with no offer to hang on cannot be stored at all: the column is NOT NULL, and it
     * would be a price nobody could be asked to honour. Skipped rather than written null.
     */
    if (!ref) continue;
    writes.push({
      listingId,
      listingSourceId: ref.listingSourceId,
      listingOfferId: ref.listingOfferId,
      prices: listingPrices,
    });
  }

  const { rows, rejected } = dedupePricePeriodRows(writes);
  if (rejected > 0) {
    // Logged rather than thrown: it is a vendor data problem, one boat wide, and the run has
    // thousands of other listings whose rates are fine.
    log.warn({
      action: "prices.rates_dropped",
      reason: "too large for price_minor; left unwritten",
      rejected,
    });
  }
  const written = await options.store.writePricePeriods(rows);

  /*
   * After the write, so a failure between the two leaves stale rates rather than none. Only the
   * offers this run resolved, and only inside the window the loader vouches for: a rate that
   * outlives its week in the vendor's list otherwise keeps opening a season nobody sells and
   * keeps the card's "from" figure at a price nobody quotes. A week whose fresh rate was
   * rejected is not restated either, so its stale rate goes with the rest.
   */
  if (options.completeWithin && answered.length > 0) {
    const pruned = await options.store.prunePricePeriods(answered, options.completeWithin, rows);
    if (pruned > 0) {
      log.info({
        action: "prices.periods_pruned",
        reason: "no longer in the provider's price list",
        pruned,
        from: options.completeWithin.start,
        to: options.completeWithin.end,
      });
    }
  }

  return written;
}

export function createDrizzlePricePeriodStore(options: {
  db: Database;
  providerId: string;
}): PricePeriodStore {
  const { db, providerId } = options;

  return {
    async loadSourceIds(listingIds) {
      const found = new Map<string, OfferRef>();
      if (listingIds.length === 0) return found;

      // Chunked for the `IN (...)` ceiling, overlapped because the chunks are
      // independent reads: eleven thousand listings is a dozen of these, and there
      // is no reason for the twelfth to wait on the first.
      await runPooled(chunked(listingIds), PRICE_WRITE_CONCURRENCY, async (chunk) => {
        const rows = await db
          .select({
            listingId: listingSource.listingId,
            listingSourceId: listingSource.id,
            listingOfferId: listingOffer.id,
          })
          .from(listingSource)
          .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
          .innerJoin(listingOffer, eq(listingOffer.listingSourceId, listingSource.id))
          .where(
            and(
              eq(providerRecord.providerId, providerId),
              eq(providerRecord.active, true),
              inArray(listingSource.listingId, [...chunk]),
              isNotNull(listingSource.listingId),
            ),
          );

        for (const row of rows) {
          if (row.listingId) {
            found.set(row.listingId, {
              listingSourceId: row.listingSourceId,
              listingOfferId: row.listingOfferId,
            });
          }
        }
      });

      return found;
    },

    async prunePricePeriods(offers, window, kept) {
      const keptByOffer = new Map<string, PricePeriodRow[]>();
      for (const row of kept) {
        const rows = keptByOffer.get(row.listingOfferId);
        if (rows) rows.push(row);
        else keptByOffer.set(row.listingOfferId, [row]);
      }

      let pruned = 0;
      const offerIds = [...new Set(offers.map((offer) => offer.listingOfferId))];
      /*
       * Each chunk names its own offers' fresh periods and nothing else, so the kept list bound
       * into one statement is a few hundred offers' weeks rather than the fleet's million.
       */
      await runPooled(
        chunked(offerIds, PRUNE_OFFER_CHUNK),
        PRICE_WRITE_CONCURRENCY,
        async (chunk) => {
          const keys = chunk.flatMap((offerId) =>
            (keptByOffer.get(offerId) ?? []).map(({ startDate, endDate }) => ({
              offerId,
              startDate,
              endDate,
            })),
          );
          const rows = await db
            .delete(listingPricePeriod)
            .where(
              and(
                inArray(listingPricePeriod.listingOfferId, chunk),
                eq(listingPricePeriod.kind, "weekly"),
                gte(listingPricePeriod.startDate, window.start),
                lt(listingPricePeriod.startDate, window.end),
                keys.length === 0
                  ? undefined
                  : sql`not exists (
                    select 1
                    from jsonb_to_recordset(${JSON.stringify(keys)}::jsonb)
                      as kept("offerId" text, "startDate" date, "endDate" date)
                    where kept."offerId" = ${listingPricePeriod.listingOfferId}
                      and kept."startDate" = ${listingPricePeriod.startDate}
                      and kept."endDate" = ${listingPricePeriod.endDate}
                  )`,
              ),
            )
            .returning({ listingOfferId: listingPricePeriod.listingOfferId });
          pruned += rows.length;
        },
      );

      return pruned;
    },

    async writePricePeriods(rows) {
      if (rows.length === 0) return 0;

      /*
       * Chunks are disjoint on the conflict target - `dedupePricePeriodRows` keyed
       * them before they were split - so two of them in flight cannot contend for a
       * row, and the order they land in is not observable.
       */
      await runPooled(chunked(rows, PRICE_ROW_CHUNK), PRICE_WRITE_CONCURRENCY, async (chunk) => {
        await db
          .insert(listingPricePeriod)
          .values(chunk)
          .onConflictDoUpdate({
            target: [
              listingPricePeriod.listingOfferId,
              listingPricePeriod.kind,
              listingPricePeriod.startDate,
              listingPricePeriod.endDate,
            ],
            set: {
              priceMinor: sql`excluded.price_minor`,
              currency: sql`excluded.currency`,
              updatedAt: sql`now()`,
            },
            /*
             * A published season's price list is the same list it was last night, so
             * without this the nightly run rewrites a million rows to restate figures
             * that have not moved - a million dead tuples, every index on the table
             * rewritten with them, and autovacuum left to clean up after a write that
             * changed nothing. Postgres skips the row entirely when this is false.
             */
            setWhere: sql`${listingPricePeriod.priceMinor} is distinct from excluded.price_minor
              or ${listingPricePeriod.currency} is distinct from excluded.currency`,
          });
      });

      /*
       * Periods in the price list, not rows Postgres actually rewrote. The two used
       * to be the same number and are not since `setWhere`; reporting the second
       * would collapse `pricePeriods` to near zero on every run after the first,
       * which reads as a sync that has stopped working rather than as one whose
       * prices are already correct.
       */
      return rows.length;
    },
  };
}
