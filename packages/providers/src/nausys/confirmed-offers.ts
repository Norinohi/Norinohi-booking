import { z } from "zod";

import type { SweepPeriod } from "../shared/sweep-periods";
import type { ConfirmedOffer, ConfirmedOfferPage } from "../sync/availability-writer";
import type { NausysClient } from "./client";
import { decimalStringToMinor } from "../shared/money";
import { reconciledListPriceMinor } from "./discounts";
import { extraLineMinor } from "./extras";
import { stableSourceHash } from "../shared/raw-retention";
import { formatNausysDate, parseNausysDate } from "../shared/dates";
import {
  nausysEndpoints,
  restFreeYachtSchema,
  restFreeYachtsRequestSchema,
  restFreeYachtsResponseSchema,
} from "./endpoints";

type RestFreeYacht = z.infer<typeof restFreeYachtSchema>;

/**
 * The weeks NauSYS will actually sell, priced, read from `freeYachts` a batch of hulls at a
 * time rather than from `freeYachtsSearch` a page at a time.
 *
 * Two things the search endpoint cannot do, both measured against production on 31 August
 * 2026 for the 17 October week:
 *
 * - It never returns `obligatoryExtras`, with or without `extendedDataSet`, so a card built
 *   from it has to reassemble the unavoidable fees out of the catalogue's own ladder across
 *   season, length, party size, base and route. `freeYachts` itemises them for the exact
 *   charter: 300 hulls asked at once came back with 179 free, 178 of them carrying their fee
 *   lines. `totalPriceWithExtras` is not a substitute, and the specification says why: it is
 *   "total price to be paid in advance by the Agency to the Fleet operator including discounts
 *   and all extras marked as advance payment" -- our cost, and only the prepaid half of the
 *   fees. On yacht 74197399 it equalled `clientPrice` while the itemised call showed 2,030.00
 *   of obligatory extras, all of them settled at the base.
 * - It is slow per call rather than per row: 28.0s for 50 rows, 29.1s for 1000, 28.2s for the
 *   whole 4,657-row answer. The batched call took 3.4s for 300 hulls.
 *
 * It also asks about our own fleet instead of the vendor's. The search walks every hull the
 * account can see, most of which we do not list; this asks for exactly the ids we sell.
 */
export const YACHT_CHUNK_SIZE = 250;

/** Mirrors the vendor's own page cursor, so a cursor stored by the old search pass still parses. */
export const nausysConfirmedCursorSchema = z.object({
  windowIndex: z.number().int().min(0),
  page: z.number().int().min(1).optional(),
});
export type NausysConfirmedCursor = z.infer<typeof nausysConfirmedCursorSchema>;

/** PAYMENT_PLAN carries the instalment schedule, ADDITIONAL_EXTRAS the optional services. */
const EXTENDED_DATA_SET = "PAYMENT_PLAN,ADDITIONAL_EXTRAS";

const freeYachtsRequestSchema = restFreeYachtsRequestSchema.omit({ credentials: true });

export interface NausysConfirmedOfferOptions {
  client: NausysClient;
  /**
   * The charters to price, split the way the walk treats them: every advertised period each
   * run, then the grid from wherever the cursor stopped. See `sweepPlan`.
   */
  periods: { advertised: readonly SweepPeriod[]; grid: readonly SweepPeriod[] };
  /**
   * Every NauSYS hull we list inside the swept companies. Read when the pass starts rather
   * than passed in whole: a run resumes hours after the source was built.
   */
  loadYachtIds: () => Promise<readonly string[]>;
  /**
   * The companies those hulls belong to, which is the scope a page's silence covers. It must
   * be the same set the ids came from: the writer reads a hull's absence from a swept period
   * as a refusal, and a company nobody asked about must not be judged by that silence.
   */
  companyIds: readonly string[];
  currency?: string;
  chunkSize?: number;
}

export async function* streamNausysConfirmedOffers(
  options: NausysConfirmedOfferOptions,
  from: NausysConfirmedCursor,
): AsyncIterable<ConfirmedOfferPage> {
  const { client } = options;
  /*
   * The advertised periods in full, then the grid from where the cursor stopped.
   *
   * `windowIndex` counts into the grid alone. Counting it into the whole walk meant the first
   * budget-truncated run left it inside the grid, and every run after that resumed there --
   * skipping all sixty advertised periods until the index wrapped, nine or ten runs later. The
   * cards those periods belong to kept whatever price the previous sweep had left on them.
   */
  const pending = [...options.periods.advertised, ...options.periods.grid.slice(from.windowIndex)];
  if (pending.length === 0) return;

  const fleetIds = [...new Set(await options.loadYachtIds())];
  const fleet = toYachtNumbers(fleetIds);
  if (fleet.length === 0) return;

  const chunkSize = options.chunkSize ?? YACHT_CHUNK_SIZE;
  const scopeKeys = options.companyIds.length > 0 ? [...options.companyIds] : null;
  const listed = new Set(fleetIds);

  /* Only the grid moves it; an advertised period is re-walked next run by design. */
  let windowIndex = from.windowIndex;
  for (const period of pending) {
    /*
     * Only the hulls advertising this charter, where the caller named them.
     *
     * Asking the whole fleet about every window is the same answer bought 65 times over: the
     * 60 advertised periods cover 6,952 hull-weeks between them, against 449,040 for the fleet
     * crossed with the windows. At ~3.4s per 250-hull batch that is the difference between
     * finishing three periods inside the pass's five-minute budget and finishing all sixty,
     * and a window the budget cuts in half leaves its unasked hulls with neither a price nor a
     * refusal -- which is exactly the state 4,248 unpriced cards were in.
     *
     * Intersected with the fleet list rather than trusted: the ids come from the read model and
     * the fleet from `listing_source`, and a hull that has left the account between the two
     * reads is not one to ask about.
     */
    const askedIds = period.yachtIds ? period.yachtIds.filter((id) => listed.has(id)) : fleetIds;
    const yachtIds = period.yachtIds ? toYachtNumbers(askedIds) : fleet;
    if (yachtIds.length === 0) {
      if (period.source === "grid") windowIndex += 1;
      /* No `swept`: a window nobody was asked about says nothing about anybody. */
      yield { offers: [], cursor: { windowIndex, page: 1 } };
      continue;
    }

    /*
     * One page per period, not per batch. `swept` is what licenses the writer to read a hull's
     * absence as a refusal, and a batch is only part of the answer: emitting it per chunk
     * would refuse every hull outside the 250 just asked about.
     */
    const offers: ConfirmedOffer[] = [];
    for (let at = 0; at < yachtIds.length; at += chunkSize) {
      const request = freeYachtsRequestSchema.parse({
        periodFrom: formatNausysDate(period.startDate),
        periodTo: formatNausysDate(period.endDate),
        yachts: yachtIds.slice(at, at + chunkSize),
        extendedDataSet: EXTENDED_DATA_SET,
        ...(options.currency ? { currency: options.currency } : null),
      });

      const response = await client.bookingCall(
        nausysEndpoints.availability.freeYachts,
        restFreeYachtsResponseSchema,
        { ...request },
      );

      for (const yacht of response.freeYachts ?? []) {
        const offer = mapFreeYachtToConfirmedOffer(yacht);
        if (offer) offers.push(offer);
      }
    }

    if (period.source === "grid") windowIndex += 1;
    yield {
      offers,
      cursor: { windowIndex, page: 1 },
      swept: {
        startDate: period.startDate,
        endDate: period.endDate,
        scopeKeys,
        /* Null where the whole fleet was asked, so the writer keeps judging by the scope alone. */
        externalYachtIds: period.yachtIds ? askedIds : null,
      },
    };
  }
}

/** The vendor keys hulls by integer; anything else in our own id column is not one of its. */
function toYachtNumbers(ids: readonly string[]): number[] {
  return ids.map((id) => Number(id)).filter((id) => Number.isSafeInteger(id) && id > 0);
}

/**
 * `clientPrice` is the only customer-facing number; `agencyPrice` is our cost and
 * never appears on `freeYachtsSearch` results anyway. UNDER_OPTION is dropped
 * rather than mapped: it is not free, and a confirmed slot must mean bookable.
 *
 * `clientPrice` is also the discounted one, which is the whole reason this pass exists for
 * the card: the catalogue rate list carries the operator's list price, and on NauSYS a
 * quarter to a third of the fleet sells its weeks below it. `listPriceMinor` carries that
 * list price back for the strike-through, and only where the vendor's own discounts account
 * for the whole difference.
 */
export function mapFreeYachtToConfirmedOffer(yacht: RestFreeYacht): ConfirmedOffer | null {
  if (yacht.status !== "FREE") return null;

  const currency = yacht.price.currency;
  const obligatoryExtrasMinor = obligatoryExtrasTotal(yacht, currency);
  /* The figure the card strikes through, on the same terms the quote strikes it; see
     `reconciledListPriceMinor`. */
  const listPriceMinor = reconciledListPriceMinor(yacht.price, currency);
  return {
    externalYachtId: String(yacht.yachtId),
    startDate: parseNausysDate(yacht.periodFrom),
    endDate: parseNausysDate(yacht.periodTo),
    priceMinor: decimalStringToMinor(yacht.price.clientPrice, currency),
    currency,
    ...(obligatoryExtrasMinor === undefined ? null : { obligatoryExtrasMinor }),
    ...(listPriceMinor === undefined ? null : { listPriceMinor }),
    sourceHash: stableSourceHash({
      yachtId: yacht.yachtId,
      periodFrom: yacht.periodFrom,
      periodTo: yacht.periodTo,
      clientPrice: yacht.price.clientPrice,
      /* In the hash because a discount that lapses moves nothing else on the row, and an
         unchanged hash is how the writer decides it has nothing to update. */
      priceListPrice: yacht.price.priceListPrice,
      currency,
      status: yacht.status,
    }),
  };
}

/**
 * What this charter must pay on top of the rate, from the offer that priced it.
 *
 * The read model prefers this over the catalogue's own fee rows for the reason Booking
 * Manager's equivalent already gives: the catalogue files a fee as a ladder across season,
 * length, party size, base and route, and rebuilding the total from it is guesswork. The
 * vendor computed it for this exact week.
 *
 * Undefined rather than a total wherever the answer would be a guess: an offer that lists no
 * obligatory extras at all has said nothing, and one pricing a fee in another currency cannot
 * be added up at all, so both leave the catalogue's reconstruction in place. An empty list is
 * a real zero and is kept. Included-in-price services total zero through `extraLineMinor`,
 * the same as they do on the quote.
 */
function obligatoryExtrasTotal(yacht: RestFreeYacht, currency: string): number | undefined {
  const extras = yacht.obligatoryExtras;
  if (extras === undefined) return undefined;
  if (extras.some((extra) => extra.currency !== currency)) return undefined;

  /* The same two bases the quote hands a percentage line; see `PercentageBasis`. */
  const basis = {
    listMinor: minorOrUndefined(yacht.price.priceListPrice, currency),
    clientMinor: minorOrUndefined(yacht.price.clientPrice, currency),
  };

  return extras.reduce((total, extra) => total + extraLineMinor(extra, currency, basis), 0);
}

function minorOrUndefined(value: string | undefined, currency: string): number | undefined {
  if (value === undefined) return undefined;
  try {
    return decimalStringToMinor(value, currency);
  } catch {
    return undefined;
  }
}
