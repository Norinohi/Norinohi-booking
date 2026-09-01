import { z } from "zod";

import type { SweepPeriod } from "../shared/sweep-periods";
import type { ConfirmedOffer, ConfirmedOfferPage } from "../sync/availability-writer";
import type { NausysClient } from "./client";
import { decimalStringToMinor } from "../shared/money";
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
 *   lines. `totalPriceWithExtras` is not a substitute — on yacht 74197399 it equalled
 *   `clientPrice` while the itemised call showed 2,030.00 of obligatory extras.
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
  /** The charters to price, in the order the sweep should walk them. */
  periods: readonly SweepPeriod[];
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
  const pending = options.periods.slice(from.windowIndex);
  if (pending.length === 0) return;

  const yachtIds = [...new Set(await options.loadYachtIds())]
    .map((id) => Number(id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  if (yachtIds.length === 0) return;

  const chunkSize = options.chunkSize ?? YACHT_CHUNK_SIZE;
  const scopeKeys = options.companyIds.length > 0 ? [...options.companyIds] : null;

  let windowIndex = from.windowIndex;
  for (const period of pending) {
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

    windowIndex += 1;
    yield {
      offers,
      cursor: { windowIndex, page: 1 },
      swept: { startDate: period.startDate, endDate: period.endDate, scopeKeys },
    };
  }
}

/**
 * `clientPrice` is the only customer-facing number; `agencyPrice` is our cost and
 * never appears on `freeYachtsSearch` results anyway. UNDER_OPTION is dropped
 * rather than mapped: it is not free, and a confirmed slot must mean bookable.
 *
 * `clientPrice` is also the discounted one, which is the whole reason this pass exists for
 * the card: the catalogue rate list carries the operator's list price, and on NauSYS a
 * quarter to a third of the fleet sells its weeks below it.
 */
export function mapFreeYachtToConfirmedOffer(yacht: RestFreeYacht): ConfirmedOffer | null {
  if (yacht.status !== "FREE") return null;

  const currency = yacht.price.currency;
  const obligatoryExtrasMinor = obligatoryExtrasTotal(yacht, currency);
  return {
    externalYachtId: String(yacht.yachtId),
    startDate: parseNausysDate(yacht.periodFrom),
    endDate: parseNausysDate(yacht.periodTo),
    priceMinor: decimalStringToMinor(yacht.price.clientPrice, currency),
    currency,
    ...(obligatoryExtrasMinor === undefined ? null : { obligatoryExtrasMinor }),
    sourceHash: stableSourceHash({
      yachtId: yacht.yachtId,
      periodFrom: yacht.periodFrom,
      periodTo: yacht.periodTo,
      clientPrice: yacht.price.clientPrice,
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
