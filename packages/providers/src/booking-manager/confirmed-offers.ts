import { stableSourceHash } from "../shared/raw-retention";
import { orderedWindow } from "../shared/ordered-window";
import {
  ACCOUNT_WIDE_SCOPE,
  type ConfirmedOffer,
  type ConfirmedOfferPage,
} from "../sync/availability-writer";
import type { BookingManagerClient } from "./client";
import type { BookingManagerConfig } from "./config";
import { formatBookingManagerDateTime } from "./dates";
import { bookingManagerEndpoints, restOfferListSchema, type RestOffer } from "./endpoints";
import { numberToMinor } from "./money";
import { rankOffers } from "./offer-ranking";
import { charterSaturdays } from "./prices";
import { sweepPlan, type SweepPeriod } from "../shared/sweep-periods";
import { z } from "zod";

/**
 * The weeks Booking Manager will actually sell, read from `/offers`.
 *
 * Occupancy and rates together are not enough to decide this, and the gap is not small.
 * `/availability` lists what is sold and `/prices` lists what a season costs, but the
 * vendor's offers engine applies constraints neither of them publishes - where the boat
 * physically is after a one-way charter, whether a turnaround fits - and refuses periods
 * that pass both. Measured account-wide on 2026-08-21, between 255 and 372 boats a week
 * were free, priced, and not offered.
 *
 * The sweep is shaped like the price sweep on purpose: one call per charter Saturday for
 * the whole fleet, which is what the vendor's own integration guide prescribes and what
 * the rate list already costs us. It is cheaper than the price sweep it runs beside -
 * 5,706 rows against 20,382 for one account-wide week - because it only names boats that
 * can be sold.
 *
 * Each page is one week and carries `swept`, which is what licenses the writer to read a
 * yacht's absence from it as a refusal rather than as a boat it has not got to yet.
 */

const DAY_MS = 86_400_000;

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Where a resumed sweep picks up: the number of weeks already swept, so the cursor names the
 * next one. Parsed at the interface boundary in `occupancy.ts`, because that is where the
 * writer hands back whatever the jsonb cursor column held.
 */
export const confirmedOfferCursorSchema = z.object({ weekIndex: z.number().int().nonnegative() });
export type ConfirmedOfferCursor = z.infer<typeof confirmedOfferCursorSchema>;

export interface BookingManagerConfirmedOfferOptions {
  client: BookingManagerClient;
  config: BookingManagerConfig;
  /** External company ids to narrow the vendor call, or empty for the whole account. */
  companyIds: readonly string[];
  years: readonly number[];
  currency?: string;
  /**
   * The charters the cards are advertising, most-advertised first. Read at sweep time rather
   * than passed in whole, because it moves as charters are sold and the read model re-mints
   * the periods this pass exists to price.
   */
  loadAdvertisedPeriods?: () => Promise<readonly SweepPeriod[]>;
  /** Today, for dropping the weeks that are already over. Injectable so the walk is testable. */
  today?: string;
}

/**
 * One `ConfirmedOffer` per yacht per week, for the charter the quote would sell.
 *
 * A week comes back once per sellable base pair - up to four rows for a fleet that runs
 * one-way - and they are the same charter offered from different ends. `rankOffers` is the
 * same order `selectOffer` applies at quote time, deliberately: this row is what the search
 * card advertises, and if the two ranked differently the card would price a charter the
 * sidebar then refuses to quote.
 *
 * `obligatoryExtrasMinor` is carried because it is the only trustworthy answer to what the
 * unavoidable fees cost. The catalogue files them as a ladder across season, charter length,
 * party size, base, route and percentage-of-charter - dimensions that differ per operator and
 * are not all published on every account - so reconstructing the total from it is guesswork
 * that has already been wrong twice. The vendor computes it for the exact charter; this stores
 * that number.
 *
 * Keyed to the Saturday we asked about, not the echoed `dateFrom`: the vendor substitutes
 * the base's real handover time, and the writer looks a period up by the date it requested.
 */
export function foldOffersToConfirmed(
  rows: readonly RestOffer[],
  checkIn: string,
  checkOut: string,
  fallbackCurrency?: string,
): ConfirmedOffer[] {
  const chosen = new Map<string, ConfirmedOffer>();

  // Ranked once, then first-wins per hull, so the winner is the same offer `selectOffer` picks.
  for (const row of rankOffers(rows)) {
    const currency = row.currency?.trim() || fallbackCurrency;
    if (!currency || currency.length !== 3 || row.price == null) continue;

    const externalYachtId = String(row.yachtId);
    if (chosen.has(externalYachtId)) continue;

    let priceMinor: number;
    let obligatoryExtrasMinor: number | undefined;
    let listPriceMinor: number | undefined;
    try {
      priceMinor = numberToMinor(row.price, currency, `yacht ${externalYachtId} offer`);
      obligatoryExtrasMinor =
        row.obligatoryExtrasPrice == null
          ? undefined
          : numberToMinor(row.obligatoryExtrasPrice, currency, `yacht ${externalYachtId} extras`);
      listPriceMinor = reconciledStartPriceMinor(row, priceMinor, currency);
    } catch {
      continue;
    }
    // Zero is the vendor declining to price, the same as it is on `/prices`. An offer at
    // nothing is not a free charter, and writing it would advertise the boat at nothing.
    if (priceMinor <= 0) continue;

    const offer: ConfirmedOffer = {
      externalYachtId,
      startDate: checkIn,
      endDate: checkOut,
      priceMinor,
      currency,
      sourceHash: stableSourceHash({
        yachtId: externalYachtId,
        checkIn,
        priceMinor,
        obligatoryExtrasMinor: obligatoryExtrasMinor ?? null,
        /* In the hash for the reason the price is: a discount that lapses changes nothing
           else on the row, and the writer skips a row whose hash has not moved. */
        listPriceMinor: listPriceMinor ?? null,
        currency,
      }),
    };
    // Zero is a real answer here - plenty of charters carry no obligatory fee at all - so it
    // is kept, and only the vendor saying nothing leaves the field unset.
    if (obligatoryExtrasMinor !== undefined) offer.obligatoryExtrasMinor = obligatoryExtrasMinor;
    if (listPriceMinor !== undefined) offer.listPriceMinor = listPriceMinor;

    chosen.set(externalYachtId, offer);
  }

  return [...chosen.values()];
}

/**
 * The list price to strike through, or nothing.
 *
 * `price` is already net of `discountPercentage` and `startPrice` is the same charter without
 * it, but only where the three reconcile exactly is the reduction one we can account for. That
 * is the test `buildCharterLines` applies before the quote shows a discount line, so the card
 * strikes a figure only where the detail page beneath it strikes the same one.
 */
function reconciledStartPriceMinor(
  row: RestOffer,
  priceMinor: number,
  currency: string,
): number | undefined {
  if (row.startPrice == null || !row.discountPercentage) return undefined;

  const startPriceMinor = numberToMinor(row.startPrice, currency, `yacht ${row.yachtId} start`);
  const discountMinor = startPriceMinor - priceMinor;
  if (discountMinor <= 0) return undefined;
  if (Math.round((startPriceMinor * row.discountPercentage) / 100) !== discountMinor) {
    return undefined;
  }

  return startPriceMinor;
}

export async function* streamBookingManagerConfirmedOffers(
  options: BookingManagerConfirmedOfferOptions,
  from: ConfirmedOfferCursor,
): AsyncIterable<ConfirmedOfferPage> {
  const { client, config } = options;
  const scopeKeys = options.companyIds.length > 0 ? [...options.companyIds] : null;
  /*
   * What the cards advertise, then the standing grid of charter Saturdays.
   *
   * The grid alone missed twice. It runs from 1 January, so a third of every budgeted run was
   * spent asking about weeks that had already happened; and it names Saturday weeks only,
   * while 539 dated Booking Manager cards advertise some other shape. A week this pass never
   * reaches keeps the price the catalogue reconstruction gives it, which is a rate plus a fee
   * total rebuilt from a ladder — it misses what only the offer states. That is how a gulet
   * card read EUR 35,000 beside a quote of EUR 42,000: a mandatory Turkish VAT line that
   * exists on the offer and nowhere in the catalogue.
   */
  const advertised = (await options.loadAdvertisedPeriods?.()) ?? [];
  const grid = charterSaturdays([...options.years]).map((checkIn) => ({
    startDate: checkIn,
    endDate: addDays(checkIn, 7),
  }));
  const plan = sweepPlan(advertised, grid, {
    today: options.today ?? new Date().toISOString().slice(0, 10),
  });

  /*
   * Every advertised period, then the grid from where the cursor stopped.
   *
   * `weekIndex` counts into the grid alone. Counting it into the merged walk meant the first
   * budget-truncated run left it inside the grid, and every later run resumed there, skipping
   * the advertised periods entirely until the index wrapped. Those are the weeks the cards are
   * showing, so they are the ones a stale price is visible on.
   */
  const pending = [...plan.advertised, ...plan.grid.slice(from.weekIndex)];
  if (pending.length === 0) return;

  /*
   * Overlapped on the same lane fan-out the price sweep uses, and delivered in week order
   * all the same. Out-of-order delivery would make the cursor mean "some weeks up to here",
   * which on a budget-truncated run decides which weeks got swept by which happened to be
   * quick - and an unswept week that looks swept is a fleet of false refusals.
   */
  const responses = orderedWindow(pending, config.sweepConcurrency, (period, slot) =>
    client.get(
      bookingManagerEndpoints.offers,
      restOfferListSchema,
      {
        dateFrom: formatBookingManagerDateTime(period.startDate),
        dateTo: formatBookingManagerDateTime(period.endDate),
        companyId: scopeKeys ?? undefined,
        currency: options.currency || undefined,
      },
      client.sweepLane("offers", slot % Math.max(1, config.sweepConcurrency)),
    ),
  );

  let weekIndex = from.weekIndex;
  for await (const { item: period, result } of responses) {
    const checkIn = period.startDate;
    const checkOut = period.endDate;
    const rows = await result;
    /* Only the grid moves it; an advertised period is re-walked next run by design. */
    if (period.source === "grid") weekIndex += 1;

    yield {
      offers: foldOffersToConfirmed(rows, checkIn, checkOut, options.currency),
      cursor: { weekIndex },
      swept: {
        startDate: checkIn,
        endDate: checkOut,
        scopeKeys: scopeKeys === null || scopeKeys.includes(ACCOUNT_WIDE_SCOPE) ? null : scopeKeys,
      },
    };
  }
}
