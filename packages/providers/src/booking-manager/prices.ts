import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { fixedLimit, orderedWindow } from "../shared/ordered-window";
import type { SeasonalPrice } from "../sync/price-writer";
import type { BookingManagerClient } from "./client";
import type { BookingManagerConfig } from "./config";
import {
  CHARTER_TURNAROUND_WEEKDAY,
  formatBookingManagerDateTime,
  parseBookingManagerDate,
} from "./dates";
import { numberToMinor } from "./money";
import {
  bookingManagerEndpoints,
  isSameBookingManagerProduct,
  restPriceListSchema,
  type RestPrice,
} from "./endpoints";
import type { BookingManagerPriceTerms } from "./price-terms";

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

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** The length every row of this sweep prices, which is what the yacht's bounds are held to. */
const SWEPT_NIGHTS = 7;

export interface BookingManagerSeasonalPriceLoaderOptions {
  client: BookingManagerClient;
  resolver: CatalogueResolver;
  config: BookingManagerConfig;
  /** Calendar years to price, matching the occupancy sweep's scopes. */
  years: number[];
  /** Asked of the vendor; a row that answers in another currency keeps its own. */
  currency?: string;
  /** Each yacht's default product, home base and length bounds; see `price-terms.ts`. */
  loadPriceTerms(
    externalYachtIds: readonly string[],
  ): Promise<Map<string, BookingManagerPriceTerms>>;
}

/** One readable `/prices` row, kept with what decides whether it is the charter `/offers` sells. */
export interface BookingManagerPriceCandidate {
  price: SeasonalPrice;
  product: string | null;
  startBaseId: string | null;
  endBaseId: string | null;
}

export function createBookingManagerSeasonalPriceLoader(
  options: BookingManagerSeasonalPriceLoaderOptions,
): (listingIds: string[]) => Promise<Map<string, SeasonalPrice[]>> {
  const { client, resolver } = options;
  // Narrows the vendor query where the allowlist can express it. An exclusion-only
  // scope has nothing to narrow to, so the sweep stays wide and the prices of an
  // excluded company are simply never asked for: its listings are hidden by then.
  const companyScope =
    options.config.companyScope.include.length > 0
      ? [...options.config.companyScope.include]
      : undefined;

  let sweep: Promise<Map<string, BookingManagerPriceCandidate[]>> | null = null;

  async function runSweep(): Promise<Map<string, BookingManagerPriceCandidate[]>> {
    const byYacht = new Map<string, BookingManagerPriceCandidate[]>();
    const concurrency = options.config.sweepConcurrency;

    /*
     * One read per charter week, several weeks at a time. Two years is a hundred-odd
     * fleet-wide responses and every one of them is a wait, so they overlap on the
     * same lane fan-out the catalogue sweep uses.
     *
     * Delivered in week order all the same. A failure ends the sweep - the loader
     * memoizes one attempt per run and the writer needs a whole price list, not most
     * of one - and out-of-order delivery would decide which weeks made it in by
     * which happened to be quick.
     */
    const weeks = orderedWindow(
      charterSaturdays(options.years),
      fixedLimit(concurrency),
      (checkIn, slot) =>
        client.get(
          bookingManagerEndpoints.prices,
          restPriceListSchema,
          {
            dateFrom: formatBookingManagerDateTime(checkIn),
            dateTo: formatBookingManagerDateTime(addDays(checkIn, 7)),
            companyId: companyScope,
            // An undefined value is dropped from the query string, so no currency
            // asks for the vendor's own default rather than for a blank one.
            currency: options.currency || undefined,
          },
          client.sweepLane("prices", slot % Math.max(1, concurrency)),
        ),
    );

    // Deliberately no yachtId: the vendor returns the whole fleet for the period,
    // which is one call instead of one per batch of boats. A configured company
    // scope still narrows it, so a staging run does not pull prices for twelve
    // thousand boats it never imported.
    for await (const { item: checkIn, result } of weeks) {
      const checkOut = addDays(checkIn, 7);
      const rows = await result;

      for (const row of rows) {
        // Keyed to the Saturday we asked for rather than the echoed `dateFrom`,
        // because that is the check-in date the writer looks a price up by. The
        // vendor substitutes the base's real handover time into what it echoes.
        const candidate = mapBookingManagerPriceCandidate(row, checkIn, checkOut, options.currency);
        // One unreadable row costs that boat that week, not the whole sweep; a
        // failure that matters is the client's throw, which passes straight out.
        if (!candidate) continue;

        const yachtId = String(row.yachtId);
        const existing = byYacht.get(yachtId);
        if (existing) {
          existing.push(candidate);
        } else {
          byYacht.set(yachtId, [candidate]);
        }
      }
    }

    return byYacht;
  }

  return async (listingIds) => {
    const byListing = new Map<string, SeasonalPrice[]>();
    if (listingIds.length === 0) return byListing;

    /*
     * One query for the whole batch. This was `toExternalListing` per listing, which
     * on a fleet-wide sweep is a round-trip per boat to answer a single question
     * about a set. A listing with no active Booking Manager source is simply absent
     * and not this loader's problem to report: the writer leaves it unpriced.
     */
    const wanted = await resolver.toExternalYachtIds(listingIds);
    if (wanted.size === 0) return byListing;

    // Assigned only after it resolves, so a failed sweep is retried by the next
    // scope rather than cached as a permanently empty fleet.
    const priced = await (sweep ??= runSweep()).catch((error: unknown) => {
      sweep = null;
      throw error;
    });

    const terms = await options.loadPriceTerms([...new Set(wanted.values())]);

    for (const [listingId, yachtId] of wanted) {
      const prices = selectBookingManagerWeeklyPrices(
        priced.get(yachtId) ?? [],
        terms.get(yachtId),
      );
      if (prices.length > 0) {
        byListing.set(listingId, prices);
      }
    }
    return byListing;
  };
}

export function mapBookingManagerPriceCandidate(
  row: RestPrice,
  checkIn: string,
  checkOut: string,
  fallbackCurrency?: string,
): BookingManagerPriceCandidate | null {
  const price = mapBookingManagerPriceRow(row, checkIn, checkOut, fallbackCurrency);
  if (!price) return null;
  return {
    price,
    product: row.product?.trim() || null,
    startBaseId: row.startBaseId ?? null,
    endBaseId: row.endBaseId ?? null,
  };
}

/**
 * One rate per week for one yacht, from the rows the vendor listed for it: the charter `/offers`
 * would sell, or nothing where no row describes one.
 *
 * Every row of a week used to be kept, and the writer's last-wins dedupe then stored whichever
 * sorted last, which was the dearest. A week comes back once per product and once per base pair,
 * so a yacht selling a bareboat week also carried its crewed price as the "from" figure. The
 * choice is made the way `/offers` makes it instead:
 *
 * - The default product only. `/prices` sometimes lists a second product and sometimes does not
 *   (Giulia's Crewed at 0.0 on 26.12.2026, absent on 05.06.2027); neither is what is sold. With
 *   no stored record to name the default, a week is priced only where the rows agree on one.
 * - A round trip only, at the home base where there is one there. `/prices` lists one-way pairs
 *   `/offers` refuses, so a week priced only one-way is left unpriced rather than advertised.
 *   A row with no base pair at all predates 2.2.2 and is read as the round trip it was.
 * - None at all for a yacht whose bounds refuse a week: a day boat stating a maximum of one
 *   night has a weekly figure in `/prices` and no weekly charter in `/offers`.
 *
 * A week left out here keeps no rate, and the confirming `/offers` sweep still opens it the moment
 * the vendor prices it as a charter it sells.
 */
export function selectBookingManagerWeeklyPrices(
  candidates: readonly BookingManagerPriceCandidate[],
  terms: BookingManagerPriceTerms | undefined,
): SeasonalPrice[] {
  if (terms?.minNights !== undefined && SWEPT_NIGHTS < terms.minNights) return [];
  if (terms?.maxNights !== undefined && SWEPT_NIGHTS > terms.maxNights) return [];

  const byWeek = new Map<string, BookingManagerPriceCandidate[]>();
  for (const candidate of candidates) {
    const week = byWeek.get(candidate.price.startDate);
    if (week) week.push(candidate);
    else byWeek.set(candidate.price.startDate, [candidate]);
  }

  const prices: SeasonalPrice[] = [];
  for (const week of byWeek.values()) {
    const chosen = chooseWeekRow(week, terms);
    if (chosen) prices.push(chosen.price);
  }
  return prices.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function chooseWeekRow(
  week: readonly BookingManagerPriceCandidate[],
  terms: BookingManagerPriceTerms | undefined,
): BookingManagerPriceCandidate | undefined {
  const defaultProduct = terms?.product;
  let ofProduct: readonly BookingManagerPriceCandidate[];
  if (defaultProduct) {
    // A row naming no product is the vendor not distinguishing, which it only does for the one
    // it sells unasked.
    ofProduct = week.filter(
      (row) => row.product === null || isSameBookingManagerProduct(row.product, defaultProduct),
    );
  } else {
    const named = new Set(week.map((row) => row.product?.toLowerCase() ?? null));
    ofProduct = named.size === 1 ? week : [];
  }

  const roundTrips = ofProduct.filter(
    (row) =>
      row.startBaseId === null || row.endBaseId === null || row.startBaseId === row.endBaseId,
  );
  const atHome =
    terms?.homeBaseId === undefined
      ? []
      : roundTrips.filter((row) => row.startBaseId === terms.homeBaseId);

  return [...(atHome.length > 0 ? atHome : roundTrips)].sort(
    (a, b) => a.price.priceMinor - b.price.priceMinor,
  )[0];
}

/**
 * Pure `RestPrice → SeasonalPrice` for one requested week, or null for a row this
 * cannot honestly price.
 *
 * The period is the week itself, `[checkIn, checkOut)`. This used to collapse to a
 * point at `checkIn`, on the reasoning that a wider period would let one week claim
 * the Saturday that begins the next. Every reader is half-open - `covers` is
 * `start <= day < end`, `overlaps` is `checkIn < end && start < checkOut`, and the
 * read model's `bookable_from` matches - so the check-out Saturday is already
 * excluded, and the collapse instead made the rate cover no day at all. A rate is
 * what opens a season, so every Booking Manager listing read as season-closed: slots
 * synced, free periods synced, calendar entirely grey, no error anywhere.
 */
export function mapBookingManagerPriceRow(
  row: RestPrice,
  checkIn: string,
  checkOut: string,
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

    return { startDate: checkIn, endDate: checkOut, priceMinor, currency };
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
  cursor += ((CHARTER_TURNAROUND_WEEKDAY - new Date(cursor).getUTCDay() + 7) % 7) * DAY_MS;

  const saturdays: string[] = [];
  for (; cursor <= end; cursor += WEEK_MS) {
    saturdays.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return saturdays;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
