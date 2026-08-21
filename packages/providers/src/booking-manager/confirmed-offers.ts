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
import { charterSaturdays } from "./prices";
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
}

/**
 * One `ConfirmedOffer` per yacht per week, at the cheapest price the vendor quoted.
 *
 * A single week comes back once per sellable base pair - up to four rows for a fleet that
 * sells one-way - and they are the same charter offered from different ends. The slot this
 * feeds carries one price, and the cheapest is the one the card should advertise, so the
 * others are folded away here rather than written as competing periods.
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
  const cheapest = new Map<string, ConfirmedOffer>();

  for (const row of rows) {
    const currency = row.currency?.trim() || fallbackCurrency;
    if (!currency || currency.length !== 3 || row.price == null) continue;

    let priceMinor: number;
    try {
      priceMinor = numberToMinor(row.price, currency, `yacht ${row.yachtId} offer`);
    } catch {
      continue;
    }
    // Zero is the vendor declining to price, the same as it is on `/prices`. An offer at
    // nothing is not a free charter, and writing it would advertise the boat at nothing.
    if (priceMinor <= 0) continue;

    const externalYachtId = String(row.yachtId);
    const existing = cheapest.get(externalYachtId);
    if (existing && existing.priceMinor <= priceMinor) continue;

    cheapest.set(externalYachtId, {
      externalYachtId,
      startDate: checkIn,
      endDate: checkOut,
      priceMinor,
      currency,
      sourceHash: stableSourceHash({ yachtId: externalYachtId, checkIn, priceMinor, currency }),
    });
  }

  return [...cheapest.values()];
}

export async function* streamBookingManagerConfirmedOffers(
  options: BookingManagerConfirmedOfferOptions,
  from: ConfirmedOfferCursor,
): AsyncIterable<ConfirmedOfferPage> {
  const { client, config } = options;
  const scopeKeys = options.companyIds.length > 0 ? [...options.companyIds] : null;
  const weeks = charterSaturdays([...options.years]);
  const pending = weeks.slice(from.weekIndex);
  if (pending.length === 0) return;

  /*
   * Overlapped on the same lane fan-out the price sweep uses, and delivered in week order
   * all the same. Out-of-order delivery would make the cursor mean "some weeks up to here",
   * which on a budget-truncated run decides which weeks got swept by which happened to be
   * quick - and an unswept week that looks swept is a fleet of false refusals.
   */
  const responses = orderedWindow(pending, config.sweepConcurrency, (checkIn, slot) =>
    client.get(
      bookingManagerEndpoints.offers,
      restOfferListSchema,
      {
        dateFrom: formatBookingManagerDateTime(checkIn),
        dateTo: formatBookingManagerDateTime(addDays(checkIn, 7)),
        companyId: scopeKeys ?? undefined,
        currency: options.currency || undefined,
      },
      client.sweepLane("offers", slot % Math.max(1, config.sweepConcurrency)),
    ),
  );

  let weekIndex = from.weekIndex;
  for await (const { item: checkIn, result } of responses) {
    const checkOut = addDays(checkIn, 7);
    const rows = await result;
    weekIndex += 1;

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
