import type { CatalogueResolver } from "../shared/catalogue-resolver";
import type { SeasonalPrice } from "../sync/availability-writer";
import type { BookingManagerClient } from "./client";
import type { BookingManagerConfig } from "./config";
import { formatBookingManagerDateTime, parseBookingManagerDate } from "./dates";
import { numberToMinor } from "./money";
import { bookingManagerEndpoints, restPriceListSchema, type RestPrice } from "./endpoints";

/**
 * Seasonal prices for the slots the availability sync synthesizes.
 *
 * The vendor's own integration guide prescribes the shape of this sweep: call
 * `/prices` once per Saturday-to-Saturday pair to build a year's price list, and
 * send only `dateFrom`/`dateTo` to get every boat back in one response. So this
 * asks a week at a time for the whole fleet rather than a year at a time for a
 * batch of yachts, which is the question the endpoint is built to answer.
 *
 * That also settles what `price` means. A row is the price of the exact period
 * requested, so a Saturday-to-Saturday request returns a weekly figure by
 * construction and nothing has to be inferred from the span.
 *
 * Booking Manager has no catalogue-wide price dump to read back out of
 * `provider_record`, so this loader is live where the NauSYS one is stored. One
 * sweep per run is memoized: the writer asks scope by scope, and the response is
 * fleet-wide regardless of who asked.
 */

const SATURDAY = 6;
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

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
  const { client, resolver } = options;
  const companyScope =
    options.config.companyIds.length > 0 ? [...options.config.companyIds] : undefined;

  const yachtByListing = new Map<string, string | null>();
  let sweep: Promise<Map<string, SeasonalPrice[]>> | null = null;

  async function externalYachtId(listingId: string): Promise<string | null> {
    const cached = yachtByListing.get(listingId);
    if (cached !== undefined) return cached;

    const ref = await resolver.toExternalListing(listingId).catch(() => null);
    const yachtId = ref?.externalYachtId ?? null;
    yachtByListing.set(listingId, yachtId);
    return yachtId;
  }

  async function runSweep(): Promise<Map<string, SeasonalPrice[]>> {
    const byYacht = new Map<string, SeasonalPrice[]>();

    for (const checkIn of charterSaturdays(options.years)) {
      const checkOut = addDays(checkIn, 7);
      // Deliberately no yachtId: the vendor returns the whole fleet for the
      // period, which is one call instead of one per batch of boats. A configured
      // company scope still narrows it, so a staging run does not pull prices for
      // twelve thousand boats it never imported.
      const query = {
        dateFrom: formatBookingManagerDateTime(checkIn),
        dateTo: formatBookingManagerDateTime(checkOut),
        companyId: companyScope,
        // An undefined value is dropped from the query string, so no currency
        // asks for the vendor's own default rather than for a blank one.
        currency: options.currency || undefined,
      };

      const rows = await client.get(bookingManagerEndpoints.prices, restPriceListSchema, query);

      for (const row of rows) {
        // Keyed to the Saturday we asked for rather than the echoed `dateFrom`,
        // because that is the check-in date the writer looks a price up by. The
        // vendor substitutes the base's real handover time into what it echoes.
        const price = mapBookingManagerPriceRow(row, checkIn, options.currency);
        // One unreadable row costs that boat that week, not the whole sweep; a
        // failure that matters is the client's throw, which passes straight out.
        if (!price) continue;

        const yachtId = String(row.yachtId);
        const existing = byYacht.get(yachtId);
        if (existing) {
          existing.push(price);
        } else {
          byYacht.set(yachtId, [price]);
        }
      }
    }

    for (const prices of byYacht.values()) {
      prices.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.priceMinor - b.priceMinor);
    }
    return byYacht;
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
    if (wanted.size === 0) return byListing;

    // Assigned only after it resolves, so a failed sweep is retried by the next
    // scope rather than cached as a permanently empty fleet.
    const priced = await (sweep ??= runSweep()).catch((error: unknown) => {
      sweep = null;
      throw error;
    });

    for (const [listingId, yachtId] of wanted) {
      const prices = priced.get(yachtId);
      if (prices && prices.length > 0) {
        byListing.set(listingId, prices);
      }
    }
    return byListing;
  };
}

/**
 * Pure `RestPrice → SeasonalPrice` for one requested week, or null for a row this
 * cannot honestly price.
 *
 * `startDate === endDate === checkIn`: the writer's lookup is inclusive on both
 * ends and only ever runs for a seven-night slot, so a week's price must cover
 * exactly its own check-in date. Widening it to the check-out date would let this
 * week win the lookup for the Saturday that begins the next one.
 */
export function mapBookingManagerPriceRow(
  row: RestPrice,
  checkIn: string,
  fallbackCurrency?: string,
): SeasonalPrice | null {
  const currency = row.currency?.trim() || fallbackCurrency;
  if (!currency || currency.length !== 3 || row.price == null) {
    return null;
  }

  try {
    // Parsed only to reject a row the vendor answered for a different period; the
    // value used is the requested check-in.
    if (row.dateFrom != null && parseBookingManagerDate(row.dateFrom) !== checkIn) {
      return null;
    }

    const priceMinor = numberToMinor(row.price, currency, `yacht ${row.yachtId} price`);
    // Zero is the absence of a price, not a free charter. The vendor returns it for
    // weeks outside its published season, and the search card takes its "from"
    // figure as the minimum across periods, so one unpriced week would advertise
    // the whole boat at nothing. Left out entirely, the way a period the vendor
    // never priced is, and filled in by a live quote if anyone asks for it.
    if (priceMinor <= 0) {
      return null;
    }

    return { startDate: checkIn, endDate: checkIn, priceMinor, currency };
  } catch {
    return null;
  }
}

/**
 * Every Saturday touched by `years`, which is the turnaround day the availability
 * writer synthesizes weeks on. Runs to the last Saturday whose week still starts
 * inside the final year.
 */
export function charterSaturdays(years: number[]): string[] {
  if (years.length === 0) return [];

  const first = Math.min(...years);
  const last = Math.max(...years);
  const end = Date.UTC(last, 11, 31);

  let cursor = Date.UTC(first, 0, 1);
  cursor += ((SATURDAY - new Date(cursor).getUTCDay() + 7) % 7) * DAY_MS;

  const saturdays: string[] = [];
  for (; cursor <= end; cursor += WEEK_MS) {
    saturdays.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return saturdays;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
