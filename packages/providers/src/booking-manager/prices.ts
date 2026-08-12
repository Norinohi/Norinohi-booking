import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { ContractError } from "../shared/errors";
import { currencyExponent, decimalStringToMinor } from "../shared/money";
import type { SeasonalPrice } from "../sync/availability-writer";
import type { BookingManagerClient } from "./client";
import type { BookingManagerConfig } from "./config";
import { formatBookingManagerDateTime, parseBookingManagerDate } from "./dates";
import { bookingManagerEndpoints, restPriceListSchema, type RestPrice } from "./endpoints";

/**
 * Seasonal prices for the slots the availability sync synthesizes.
 *
 * Booking Manager has no catalogue-wide price dump to read back out of
 * `provider_record`: `/prices` refuses a call without an explicit
 * `dateFrom`/`dateTo`, so this loader is live where the NauSYS one is stored.
 * The vendor lane is sequential, so yacht ids are batched into the array
 * parameter and one call covers a whole year for a whole batch.
 */

const WEEK_NIGHTS = 7;
const DAY_MS = 86_400_000;

/**
 * Keeps the query string well inside what proxies accept while still collapsing a
 * fleet-sized load into a handful of calls.
 */
const YACHTS_PER_CALL = 50;

export interface BookingManagerSeasonalPriceLoaderOptions {
  client: BookingManagerClient;
  resolver: CatalogueResolver;
  config: BookingManagerConfig;
  /** Calendar years to price, matching the occupancy sweep's scopes. */
  years: number[];
  /** Asked of the vendor; a row that answers in another currency keeps its own. */
  currency?: string;
}

export function createBookingManagerSeasonalPriceLoader(
  options: BookingManagerSeasonalPriceLoaderOptions,
): (listingIds: string[]) => Promise<Map<string, SeasonalPrice[]>> {
  const { client, resolver, years } = options;

  // Both caches live for the loader instance, which is the sync run: the writer
  // asks per scope, and a fleet spread over several companies would otherwise
  // re-resolve and re-fetch the same yachts once per company.
  const yachtByListing = new Map<string, string | null>();
  const pricesByYacht = new Map<string, SeasonalPrice[]>();

  async function externalYachtId(listingId: string): Promise<string | null> {
    const cached = yachtByListing.get(listingId);
    if (cached !== undefined) return cached;

    const ref = await resolver.toExternalListing(listingId).catch(() => null);
    const yachtId = ref?.externalYachtId ?? null;
    yachtByListing.set(listingId, yachtId);
    return yachtId;
  }

  async function fetchInto(yachtIds: string[]): Promise<void> {
    const fetched = new Map<string, SeasonalPrice[]>(yachtIds.map((id) => [id, []]));

    for (const year of years) {
      for (const batch of chunk(yachtIds, YACHTS_PER_CALL)) {
        const rows = await client.get(bookingManagerEndpoints.prices, restPriceListSchema, {
          dateFrom: formatBookingManagerDateTime(`${year}-01-01`),
          dateTo: formatBookingManagerDateTime(`${year}-12-31`),
          yachtId: batch,
          // The response carries no duration field, so asking for more than one
          // would return rows we could not tell apart. Seven is the only duration
          // a synthesized slot is ever priced from.
          tripDuration: [WEEK_NIGHTS],
          ...(options.currency ? { currency: options.currency } : {}),
        });

        for (const row of rows) {
          const price = mapBookingManagerPriceRow(row, options.currency);
          // One unreadable row costs that period, not the fleet's whole price load;
          // a failure that matters is the client's throw, which passes straight out.
          if (price) {
            fetched.get(String(row.yachtId))?.push(price);
          }
        }
      }
    }

    // Merged only once every call landed, so an aborted load leaves no yacht cached
    // with the half of its calendar that happened to arrive first.
    for (const [yachtId, prices] of fetched) {
      prices.sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) ||
          a.endDate.localeCompare(b.endDate) ||
          a.priceMinor - b.priceMinor,
      );
      pricesByYacht.set(yachtId, prices);
    }
  }

  return async (listingIds) => {
    const byListing = new Map<string, SeasonalPrice[]>();
    if (listingIds.length === 0) return byListing;

    const wanted = new Map<string, string>();
    for (const listingId of new Set(listingIds)) {
      const yachtId = await externalYachtId(listingId);
      // A listing with no active Booking Manager source is not this loader's
      // problem to report: the writer simply leaves its slots unpriced.
      if (yachtId) {
        wanted.set(listingId, yachtId);
      }
    }

    const missing = [...new Set(wanted.values())].filter((id) => !pricesByYacht.has(id));
    if (missing.length > 0) {
      await fetchInto(missing);
    }

    for (const [listingId, yachtId] of wanted) {
      const prices = pricesByYacht.get(yachtId);
      if (prices && prices.length > 0) {
        byListing.set(listingId, prices);
      }
    }
    return byListing;
  };
}

/**
 * Pure `RestPrice → SeasonalPrice`, or null for a row this cannot honestly price.
 *
 * The writer only ever applies a seasonal price to a seven-night slot, because a
 * weekly figure divided or multiplied into another duration is not what the vendor
 * charges. That constraint is enforced here as well as there:
 *
 * - a row spanning exactly seven nights is one priced week, so it covers that one
 *   start date and nothing else. Widening it to `dateTo` would let the week before
 *   win the lookup for a Saturday that begins the next one;
 * - a row spanning longer is a season block whose figure is the weekly rate inside
 *   it, so it covers every start date in the block, as the NauSYS price lists do;
 * - a row spanning less than seven nights prices a short charter and is dropped.
 *
 * VENDOR QUESTION Q-BM-PRICE-DURATION: is `price` on a multi-week row the weekly
 * rate for that season (assumed, and what `tripDuration=7` is sent to pin down), or
 * the total for the whole span? If it is the total, every long row over-prices.
 */
export function mapBookingManagerPriceRow(
  row: RestPrice,
  fallbackCurrency?: string,
): SeasonalPrice | null {
  const currency = row.currency?.trim() || fallbackCurrency;
  if (!currency || currency.length !== 3 || row.price == null) {
    return null;
  }

  try {
    const startDate = parseBookingManagerDate(row.dateFrom);
    const endDate = parseBookingManagerDate(row.dateTo);
    const nights =
      (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS;
    if (nights < WEEK_NIGHTS) {
      return null;
    }

    const priceMinor = numberToMinor(row.price, currency, `yacht ${row.yachtId} price`);
    if (priceMinor < 0) {
      return null;
    }

    return {
      startDate,
      endDate: nights === WEEK_NIGHTS ? startDate : endDate,
      priceMinor,
      currency,
    };
  } catch {
    return null;
  }
}

/**
 * Booking Manager ships money as JSON numbers, which are binary floats. Pinned to
 * the currency's own exponent before the shared string converter sees it, exactly
 * as `quote.ts` does; the two must agree or a slot and its quote disagree by a cent.
 */
function numberToMinor(value: number, currency: string, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ContractError(
      `Booking Manager ${field} is not a finite number: ${JSON.stringify(value)}`,
    );
  }
  return decimalStringToMinor(value.toFixed(currencyExponent(currency)), currency);
}

function chunk(values: string[], size: number): string[][] {
  const batches: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    batches.push(values.slice(index, index + size));
  }
  return batches;
}
