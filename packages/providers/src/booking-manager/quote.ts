import { log } from "evlog";
import type { z } from "zod";

import type { CatalogueResolver } from "../shared/catalogue-resolver";
import {
  ContractError,
  PRODUCT_NOT_OFFERED,
  ROUTE_NOT_OFFERED,
  SlotUnavailableError,
} from "../shared/errors";
import { formatExtraCode } from "../shared/extra-code";
import { stripHtml } from "../shared/html-text";
import { text, toExactPositiveIntId } from "../shared/projection-helpers";
import { stableSourceHash } from "../shared/raw-retention";
import { DEFAULT_LINE_LABELS } from "../shared/generic-labels";
import { wallClockTime } from "../shared/wall-clock";
import {
  providerQuoteSchema,
  type ProviderQuoteCommission,
  quoteRequestSchema,
  type BookingDraft,
  type CrewType,
  type Money,
  type ProviderQuote,
  type QuoteRequest,
} from "../types";
import type { BookingManagerClient } from "./client";
import type { BookingManagerConfig } from "./config";
import { formatBookingManagerDateTime, parseBookingManagerDate } from "./dates";
import { numberToMinor } from "./money";
import { allInPrice, isOneWay, rankOffers } from "./offer-ranking";
import {
  BM_EXTRA_KIND,
  bookingManagerEndpoints,
  isSameBookingManagerProduct,
  restOfferListSchema,
  type RestExtras,
  type RestOffer,
} from "./endpoints";

const PROVIDER = "booking_manager" as const;

const DEFAULT_QUOTE_TTL_MS = 15 * 60 * 1000;

/**
 * The vendor numbers extras in one space with no separate equipment list, which is
 * the same call `extrasOf` makes when it files them, so every code on both sides
 * of the quote is a service.
 */
const EXTRA_KIND = "service" as const;

const DEFAULT_LABELS = DEFAULT_LINE_LABELS;

type QuoteLine = ProviderQuote["lines"][number];
type PaymentPolicy = ProviderQuote["paymentPolicy"];

export interface BookingManagerQuoteServiceOptions {
  client: BookingManagerClient;
  resolver: CatalogueResolver;
  config: BookingManagerConfig;
  /**
   * How long our quote stays valid. `/offers` reserves nothing, so this TTL is a
   * promise we make on our own account: the slot can be sold to someone else a
   * second after we read it.
   */
  quoteTtlMs?: number;
  /**
   * The product the listing sells for this vendor yacht, off its stored record: the default
   * one, whose extras, crew and weekly rates the catalogue shows. Named on the call rather than
   * left to the vendor's default so the quote and the reservation name one product even when
   * the operator changes its default between the two. Undefined leaves it to the vendor.
   */
  loadProductName?: (externalYachtId: string) => Promise<string | undefined>;
  /** Resolves a vendor extra id to a customer-facing line label. */
  labelFor?: (externalId: string) => string | undefined;
  /**
   * The listing's extras by canonical code, for naming the lines they price.
   * `/offers` sends obligatory extras whose `name` is empty on some accounts, and
   * without this those lines read "Charter extra" in the sidebar while the same
   * item is spelled out by name in the page's own section, so the customer cannot
   * tell they are one charge.
   */
  loadExtraLabels?: (listingId: string) => Promise<ReadonlyMap<string, string>>;
  /**
   * The operator's `maxDiscountFromCommissionPercentage` for the quoted yacht, by its vendor id,
   * else its company's, off the stored catalogue. Undefined where neither states one.
   */
  loadDiscountCapPercentage?: (externalYachtId: string) => Promise<number | undefined>;
  now?: () => number;
}

export interface BookingManagerQuoteService {
  getBookingManagerQuote(input: QuoteRequest): Promise<ProviderQuote>;
}

/** An `/offers` query for one yacht's charter; `productName` undefined asks for its default. */
type OfferQuery = {
  dateFrom: string;
  dateTo: string;
  yachtId: [string];
  currency: string;
  passengersOnBoard: number;
  productName: string | undefined;
};

export function createBookingManagerQuoteService(
  options: BookingManagerQuoteServiceOptions,
): BookingManagerQuoteService {
  const { client, resolver } = options;
  const quoteTtlMs = options.quoteTtlMs ?? DEFAULT_QUOTE_TTL_MS;
  const now = options.now ?? Date.now;

  /** The products the yacht sells this charter as, from this answer or else the vendor's default. */
  async function productsOnSale(
    answered: readonly RestOffer[],
    query: OfferQuery,
    checkIn: string,
    checkOut: string,
  ): Promise<string[]> {
    const [yachtId] = query.yachtId;
    let sold = offersForPeriod(answered, yachtId, checkIn, checkOut, undefined);
    if (sold.length === 0) {
      const unnamed = await client.get(
        bookingManagerEndpoints.offers,
        restOfferListSchema,
        { ...query, productName: undefined },
        client.liveLane(),
      );
      sold = offersForPeriod(unnamed, yachtId, checkIn, checkOut, undefined);
    }
    return [...new Set(sold.map((offer) => offer.product?.trim() || "an unnamed product"))];
  }

  return {
    async getBookingManagerQuote(input: QuoteRequest): Promise<ProviderQuote> {
      const parsed = quoteRequestSchema.parse(input);
      const ref = await resolver.toExternalListing(parsed.listingId);
      // Digits, not a number: the id can be 19 long, and `/offers` takes it as a
      // query parameter, where a string is exactly what goes on the wire anyway.
      const yachtId = toExactPositiveIntId(ref.externalYachtId, {
        provider: "Booking Manager",
        what: "the yacht id",
      });
      const productName = await options.loadProductName?.(yachtId);

      // Midnight is mandatory here, not a placeholder: MMK confirmed the vendor
      // substitutes the base's own check-in/check-out time and returns it on the
      // offer, so sending a time of our own is refused or silently overridden.
      const offerQuery: OfferQuery = {
        dateFrom: formatBookingManagerDateTime(parsed.checkIn),
        dateTo: formatBookingManagerDateTime(parsed.checkOut),
        yachtId: [yachtId],
        currency: parsed.currency,
        passengersOnBoard: parsed.guests,
        // An undefined value is dropped from the query string, so an unnamed
        // product asks for the vendor's default rather than for an empty one.
        productName,
      };

      const offers = await client.get(
        bookingManagerEndpoints.offers,
        restOfferListSchema,
        offerQuery,
        /* Somebody is waiting on this one; see `liveLane`. */
        client.liveLane(),
      );

      const route: RequestedRoute = {
        startBaseId: parsed.startBaseId,
        endBaseId: parsed.endBaseId,
      };
      const offer = selectOffer(
        offers,
        yachtId,
        parsed.checkIn,
        parsed.checkOut,
        productName,
        route,
      );
      if (!offer) {
        const onSaleElsewhere =
          (route.startBaseId !== undefined || route.endBaseId !== undefined) &&
          selectOffer(offers, yachtId, parsed.checkIn, parsed.checkOut, productName) !== undefined;
        if (onSaleElsewhere) {
          throw new SlotUnavailableError(
            `Booking Manager sells yacht ${yachtId} from ${parsed.checkIn} to ${parsed.checkOut}, but not from base ${route.startBaseId ?? "any"} to base ${route.endBaseId ?? "any"}`,
            { endpoint: bookingManagerEndpoints.offers, providerCode: ROUTE_NOT_OFFERED },
          );
        }
        /*
         * The product is named from the stored yacht, which is only as fresh as the last
         * catalogue sync. An operator who renamed or dropped it since gets silence for it,
         * and read as the week going that silence would take a week still on sale off the
         * card. So the vendor is asked once more, unnamed, which answers its default product.
         */
        if (productName !== undefined) {
          const offered = await productsOnSale(offers, offerQuery, parsed.checkIn, parsed.checkOut);
          if (offered.length > 0) {
            log.warn({
              action: "booking_manager.quote.product_not_offered",
              yachtId,
              checkIn: parsed.checkIn,
              productName,
              offered: offered.join(", "),
            });
            throw new SlotUnavailableError(
              `Booking Manager sells yacht ${yachtId} from ${parsed.checkIn} to ${parsed.checkOut} as ${offered.join(", ")}, not as ${productName}`,
              { endpoint: bookingManagerEndpoints.offers, providerCode: PRODUCT_NOT_OFFERED },
            );
          }
        }
        throw new SlotUnavailableError(
          `Booking Manager has no offer for yacht ${yachtId} from ${parsed.checkIn} to ${parsed.checkOut}`,
          { endpoint: bookingManagerEndpoints.offers, providerCode: "NO_OFFER" },
        );
      }

      const [extraLabels, maxDiscountFromCommissionPercentage] = await Promise.all([
        options.loadExtraLabels?.(parsed.listingId),
        options.loadDiscountCapPercentage?.(yachtId),
      ]);

      const instalments = (offer.paymentPlan ?? []).filter((entry) => entry.amount != null);
      if (instalments.length > 2) {
        log.info({
          action: "booking_manager.quote.payment_plan_collapsed",
          yachtId,
          instalments: instalments.length,
        });
      }

      return mapOfferToProviderQuote({
        offer,
        listingId: parsed.listingId,
        checkIn: parsed.checkIn,
        checkOut: parsed.checkOut,
        guests: parsed.guests,
        crewType: parsed.crewType,
        requestedCurrency: parsed.currency,
        maxDiscountFromCommissionPercentage,
        expiresAt: new Date(now() + quoteTtlMs).toISOString(),
        /* The catalogue answers first; an extra the sync never recorded falls
           through to whatever the caller knows. */
        labelFor: (externalId) =>
          extraLabels?.get(formatExtraCode(EXTRA_KIND, externalId)) ??
          options.labelFor?.(externalId),
        // Every pair the vendor would sell this week, so the sidebar can offer the choice
        // rather than have one made for the customer by array order.
        routeOptions: routeOptionsFor(
          offers,
          yachtId,
          parsed.checkIn,
          parsed.checkOut,
          productName,
          parsed.currency,
        ),
      });
    },
  };
}

/**
 * The quote request a stored quote was priced on, rebuilt from the draft the hold carries.
 *
 * The hold re-prices to check the number has not moved, and that check is only honest if it
 * asks for the same charter. `/offers` answers one offer per sellable base pair and
 * `selectOffer` narrows to a pair only when it is given one, so a re-price that drops the
 * customer's drop-off prices the same-base return `rankOffers` puts first - and refuses every
 * one-way with PRICE_CHANGED for a price that never moved.
 *
 * The currency is the quote's for the same reason: `/offers` converts to whatever it is asked
 * for, so a quote read in GBP and re-priced in the account's EUR compares two different figures.
 * `fallbackCurrency` stands only for a draft that carries none.
 */
export function repriceRequestFor(draft: BookingDraft, fallbackCurrency: string): QuoteRequest {
  const request: QuoteRequest = {
    listingId: draft.listingId,
    checkIn: draft.checkIn,
    checkOut: draft.checkOut,
    guests: draft.guests,
    extras: draft.extras,
    currency: draft.currency ?? fallbackCurrency,
  };
  if (draft.crewType) request.crewType = draft.crewType;
  if (draft.route?.startBaseId) request.startBaseId = draft.route.startBaseId;
  if (draft.route?.endBaseId) request.endBaseId = draft.route.endBaseId;
  return request;
}

/**
 * What a reservation opened on this quote answers as `clientPrice`: every line paid through us,
 * that is the charter net of the vendor's discounts plus each obligatory extra not payable at
 * the base. The vendor adds those extras itself on POST, so the figure is theirs as much as the
 * charter is. Measured on company 225: West Wind's option came back at 501.00 on a 1.00 charter
 * carrying the 500.00 APA, and the 112 reservations saved from it agree once "Agency discount",
 * which is our commission and never the customer's, is left out. The quote's discount lines are
 * all the vendor's; ours are applied later.
 */
export function clientPriceOf(quote: ProviderQuote): Money {
  const amountMinor = quote.lines
    .filter((line) => line.payWhen === "now")
    .reduce((total, line) => total + line.amount.amountMinor, 0);
  return { amountMinor, currency: quote.currency };
}

/** The base pair a quote request pinned; either end left undefined is the adapter's to pick. */
export interface RequestedRoute {
  startBaseId?: string | undefined;
  endBaseId?: string | undefined;
}

/**
 * One call can answer with several offers for the same hull: a yacht sold under more than one
 * product, and one offer per sellable base pair where the fleet runs one-way.
 *
 * Product is chosen first, because that is a different charter. Among what is left the offers
 * differ only in where the charter starts and ends, and they are ranked: a charter that returns
 * to its own base wins, then the cheapest all-in.
 *
 * Taking `candidates[0]` was wrong, and not by a rounding. The vendor orders by product, not by
 * route, so the first candidate is simply whichever base pair it listed first - and on the week
 * of 26 September 2026 that was Portumna to Carrick, a one-way carrying a 155 EUR one-way fee,
 * with the same-base return sitting behind it in the same response at 155 EUR less. Nothing in
 * the request said one-way: this listing publishes no `listing_one_way_rule`, so the booking
 * flow has no drop-off control at all and the customer could not have asked for it. We were
 * charging for a route chosen by array order.
 *
 * A pinned end narrows rather than ranks, and an empty result is not silently widened: pricing
 * a return charter for someone who asked to finish elsewhere would quote a trip they did not ask
 * for. The start is pinned beside it for the same reason. Narrowed by the drop-off alone, a week
 * sold from Carrick and Portumna answered "Carrick to Portumna" with "Portumna to Portumna",
 * because a round trip ranks first.
 */
export function selectOffer(
  offers: readonly RestOffer[],
  yachtId: string,
  checkIn: string,
  checkOut: string,
  productName: string | undefined,
  route: RequestedRoute = {},
): RestOffer | undefined {
  const { startBaseId, endBaseId } = route;
  return rankOffers(
    offersForPeriod(offers, yachtId, checkIn, checkOut, productName).filter(
      (offer) =>
        (startBaseId === undefined || offer.startBaseId === startBaseId) &&
        (endBaseId === undefined || offer.endBaseId === endBaseId),
    ),
  )[0];
}

/**
 * The offers for exactly this charter, of the product asked for where one was.
 *
 * An offer of another product is dropped rather than taken in its place: it is another charter,
 * with its own crew and extras, and a reservation opened for the product we named would not be
 * the one priced. So is one at no price, before the ranking, where it would otherwise win as the
 * cheapest: the availability sweep skips it the same way, so the card and the quote agree.
 */
function offersForPeriod(
  offers: readonly RestOffer[],
  yachtId: string,
  checkIn: string,
  checkOut: string,
  productName: string | undefined,
): RestOffer[] {
  return offers.filter(
    (offer) =>
      offer.yachtId === yachtId &&
      offer.dateFrom != null &&
      offer.dateTo != null &&
      parseBookingManagerDate(offer.dateFrom) === checkIn &&
      parseBookingManagerDate(offer.dateTo) === checkOut &&
      offer.price != null &&
      offer.price > 0 &&
      (productName === undefined || isSameBookingManagerProduct(offer.product, productName)),
  );
}

/**
 * The routes on offer for one charter, cheapest first, deduplicated by base pair.
 *
 * Priced all-in because that is the number the choice turns on: the same hull at the same
 * 809 EUR is 959 EUR finishing where it started and 1,114 EUR finishing across the county.
 */
export function routeOptionsFor(
  offers: readonly RestOffer[],
  yachtId: string,
  checkIn: string,
  checkOut: string,
  productName: string | undefined,
  currency: string,
): ProviderQuote["routeOptions"] {
  const byPair = new Map<string, ProviderQuote["routeOptions"][number]>();

  for (const offer of rankOffers(
    offersForPeriod(offers, yachtId, checkIn, checkOut, productName),
  )) {
    const key = `${offer.startBaseId ?? ""}>${offer.endBaseId ?? ""}`;
    if (byPair.has(key)) continue;

    const option: ProviderQuote["routeOptions"][number] = {
      isOneWay: isOneWay(offer),
      total: {
        amountMinor: numberToMinor(allInPrice(offer), currency, `yacht ${offer.yachtId} route`),
        currency,
      },
    };
    if (offer.startBaseId) option.startBaseId = offer.startBaseId;
    if (offer.endBaseId) option.endBaseId = offer.endBaseId;
    if (offer.startBase) option.startBaseName = offer.startBase;
    if (offer.endBase) option.endBaseName = offer.endBase;
    byPair.set(key, option);
  }

  return [...byPair.values()];
}

/** The offer's own bases, or null where it named neither. */
function routeOf(offer: RestOffer): ProviderQuote["route"] {
  const startBaseId = offer.startBaseId ?? undefined;
  const endBaseId = offer.endBaseId ?? undefined;
  if (startBaseId === undefined && endBaseId === undefined) return null;

  const route: NonNullable<ProviderQuote["route"]> = {};
  if (startBaseId) route.startBaseId = startBaseId;
  if (endBaseId) route.endBaseId = endBaseId;
  return route;
}

export interface OfferTimes {
  checkInTime: string | undefined;
  checkOutTime: string | undefined;
}

/** The base's own check-in/check-out wall clock, as the vendor substituted it. */
export function readOfferTimes(offer: RestOffer): OfferTimes {
  return { checkInTime: wallClockTime(offer.dateFrom), checkOutTime: wallClockTime(offer.dateTo) };
}

export interface OfferMapping {
  offer: RestOffer;
  listingId: string;
  /** ISO `yyyy-MM-dd`, ours; the vendor's echo is checked against it. */
  checkIn: string;
  checkOut: string;
  guests: number;
  crewType?: CrewType | undefined;
  /** Every route the vendor offered for this charter; see `routeOptions` on the quote. */
  routeOptions?: ProviderQuote["routeOptions"];
  requestedCurrency: string;
  /** The operator's bound on our client discount, as a percentage of the commission. */
  maxDiscountFromCommissionPercentage?: number | undefined;
  expiresAt: string;
  labelFor?: ((externalId: string) => string | undefined) | undefined;
}

/** Pure `RestOffer → ProviderQuote`. No I/O, no clock, no vendor field beyond this file. */
export function mapOfferToProviderQuote(input: OfferMapping): ProviderQuote {
  const { offer } = input;

  const currency = offer.currency?.trim() || input.requestedCurrency;
  if (currency.length !== 3) {
    throw new ContractError(
      `Booking Manager offer for yacht ${offer.yachtId} has currency ${JSON.stringify(offer.currency)}`,
      { endpoint: bookingManagerEndpoints.offers },
    );
  }

  if (offer.price == null) {
    throw new ContractError(`Booking Manager offer for yacht ${offer.yachtId} carries no price`, {
      endpoint: bookingManagerEndpoints.offers,
    });
  }

  const priceMinor = customerPriceMinor(offer, offer.price, currency);

  const charterLines = buildCharterLines(offer, currency, priceMinor);
  const extraLines = (offer.obligatoryExtras ?? []).map((extra) =>
    toExtraLine(extra, currency, offer, input),
  );

  /*
   * Q-BM-EXTRAS is answered: `obligatoryExtrasPrice` IS additive to `price`, not
   * already inside it. Measured 2026-08-20 - `paymentPlan` sums to `price` alone
   * and never to `price + obligatoryExtrasPrice`, and a yacht with 1922.00 of
   * extras carried the same `price` as one with none. The line items sum to the
   * declared subtotal to the cent, the sole exception being a pro-rated `per_week`
   * extra on a 4-night charter, off by 0.003 at the total.
   *
   * That exception is why the check is a tolerance rather than an equality now. Each line is
   * rounded to the cent on its own, so a subtotal assembled from n of them can sit up to n
   * cents from the one the vendor rounded once - and an equality turned that into a refusal
   * for the whole charter, on every date, forever. Yacht 5823396120000107041 was unbookable
   * over a single cent: 38451 against a declared 38452.
   *
   * Inside the tolerance the vendor's own subtotal wins and the difference is absorbed into
   * the largest line, so what the customer is shown still adds up to what Booking Manager
   * says the extras cost. Outside it the throw stands: that is a payload we have misread, and
   * mispricing a booking downstream is worse than refusing to price it.
   */
  const summedMinor = sumMinor(extraLines);
  let extrasMinor = summedMinor;
  if (offer.obligatoryExtrasPrice != null) {
    const declared = numberToMinor(offer.obligatoryExtrasPrice, currency, "obligatoryExtrasPrice");
    const drift = declared - summedMinor;
    if (Math.abs(drift) > Math.max(1, extraLines.length)) {
      throw new ContractError(
        `Booking Manager obligatory extras for yacht ${offer.yachtId} sum to ${summedMinor}, declared ${declared}`,
        { endpoint: bookingManagerEndpoints.offers },
      );
    }

    const largest = extraLines.reduce<QuoteLine | null>(
      (top, line) =>
        top === null || line.amount.amountMinor > top.amount.amountMinor ? line : top,
      null,
    );
    if (drift !== 0 && largest) {
      largest.amount = { ...largest.amount, amountMinor: largest.amount.amountMinor + drift };
    }
    extrasMinor = largest ? declared : summedMinor;
  }

  const lines = [...charterLines, ...extraLines];
  const totalMinor = priceMinor + extrasMinor;
  if (sumMinor(lines) !== totalMinor) {
    throw new ContractError(
      `Booking Manager quote lines for yacht ${offer.yachtId} sum to ${sumMinor(lines)}, expected ${totalMinor}`,
      { endpoint: bookingManagerEndpoints.offers },
    );
  }

  const payableNowMinor = sumMinor(lines.filter((line) => line.payWhen === "now"));
  const { policy, depositMinor } = toPaymentPolicy(offer, currency, payableNowMinor);
  const priceSourceHash = priceObservationHash(offer, currency);
  const securityDeposit = securityDepositOf(offer, currency);

  const quoteInput: z.input<typeof providerQuoteSchema> = {
    // `/offers` creates nothing provider-side, so there is no vendor quote id to
    // carry: this identifies our observation and is never sent to the vendor.
    id: `bm_${offer.yachtId}_${priceSourceHash.slice(0, 16)}`,
    provider: PROVIDER,
    listingId: input.listingId,
    providerSourceId: `${PROVIDER}:${offer.yachtId}`,
    // Calendar dates only. The wall-clock times the vendor substituted are not part
    // of the price, and ride on `checkInTime`/`checkOutTime` below instead.
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: input.guests,
    crewType: input.crewType ?? null,
    currency,
    lines,
    total: { amountMinor: totalMinor, currency },
    deposit: { amountMinor: depositMinor, currency },
    paymentPolicy: policy,
    /*
     * The pair this offer was priced for, carried so the reservation opens the same charter.
     * `selectOffer` may well have picked a base the listing does not call home - a boat left
     * at the other end of the run is offered from there - and the booking used to overwrite
     * both ends with the listing's own base.
     */
    route: routeOf(offer),
    routeOptions: input.routeOptions ?? [],
    priceSourceHash,
    repriced: false,
    expiresAt: input.expiresAt,
  };
  const commission = commissionOf(offer, currency);
  if (commission) quoteInput.commission = commission;
  const maxClientDiscount = maxClientDiscountOf(
    commission?.amount.amountMinor,
    input.maxDiscountFromCommissionPercentage,
  );
  if (maxClientDiscount !== undefined) {
    quoteInput.maxClientDiscount = { amountMinor: maxClientDiscount, currency };
  }
  if (securityDeposit) quoteInput.securityDeposit = securityDeposit;
  const times = readOfferTimes(offer);
  if (times.checkInTime) quoteInput.checkInTime = times.checkInTime;
  if (times.checkOutTime) quoteInput.checkOutTime = times.checkOutTime;

  return providerQuoteSchema.parse(quoteInput);
}

/**
 * The one switch for open question 7 (pricing semantics) on the Booking Manager
 * side, per `docs/booking-manager-api-backend-map.md` §6.
 *
 * `price` is read as the client-facing figure and `commissionValue` as our share
 * *inside* it, so the commission is deliberately not added or subtracted here:
 * netting it out would bill the customer our cost price, adding it would charge
 * the commission twice. MMK has not confirmed how `price` relates to the
 * reservation's `finalPrice`/`clientPrice` pair; if it turns out to be the
 * agency-facing figure, this function is the only place that changes.
 */
function customerPriceMinor(offer: RestOffer, price: number, currency: string): number {
  return numberToMinor(price, currency, `offer ${offer.yachtId} price`);
}

/**
 * How much of the price we may give away of our own accord, in minor units, or undefined for no
 * bound.
 *
 * Booking Manager states the bound per company and yacht as `maxDiscountFromCommissionPercentage`
 * (10 on company 225, whose commission is 15; 0 on about 2,900 of 11,400 yachts account-wide).
 * The spec gives only an example value, so it is read as a share of the commission, the smaller
 * of the two readings its name allows, until the vendor answers Q2 in
 * docs/vendor/booking-manager-questions-v2.md: a share of the price would allow over six times
 * more on 225. Never more than the commission itself, past which we would sell below what we pay
 * the operator, and a bound stated against a commission the offer did not report allows nothing.
 */
function maxClientDiscountOf(
  commissionMinor: number | undefined,
  percentage: number | undefined,
): number | undefined {
  if (percentage === undefined || !Number.isFinite(percentage)) return commissionMinor;
  if (commissionMinor === undefined) return 0;
  const share = Math.min(Math.max(percentage, 0), 100) / 100;
  return Math.floor(commissionMinor * share);
}

/**
 * Our share of this charter, as the vendor states it on the offer.
 *
 * Both halves come from the vendor and are kept as sent rather than one being derived from
 * the other: `commissionValue` is what it will pay, and a percentage recomputed from a
 * rounded amount drifts in the last decimal. Nothing here touches `price` -- see
 * `customerPriceMinor`: the commission sits inside the customer's total already.
 */
function commissionOf(offer: RestOffer, currency: string): ProviderQuoteCommission | undefined {
  if (offer.commissionValue == null) return undefined;

  let amountMinor: number;
  try {
    amountMinor = numberToMinor(
      offer.commissionValue,
      currency,
      `offer ${offer.yachtId} commission`,
    );
  } catch {
    return undefined;
  }
  if (amountMinor < 0) return undefined;

  const commission: ProviderQuoteCommission = { amount: { amountMinor, currency } };
  if (
    offer.commissionPercentage != null &&
    offer.commissionPercentage >= 0 &&
    offer.commissionPercentage <= 100
  ) {
    commission.pct = offer.commissionPercentage;
  }
  return commission;
}

/* ------------------------------------------------------------------- lines */

/**
 * `price` is already net of `discountPercentage`; `startPrice` is what the same charter costs
 * without it. The reduction is shown as lines of its own only where the vendor accounts for it,
 * so a customer sees where it came from: one line per `discounts` entry, under the operator's
 * name for it ("Early booking 2027"), where those add up to `startPrice - price`; else one
 * unnamed line where `discountPercentage` explains it. Each check allows a cent per figure,
 * because every figure is rounded on its own (30.000002 percent on one live offer). Where
 * neither accounts for it, `price` wins and the discount is dropped from the quote rather than
 * guessed at: it is the only number the vendor bills against.
 */
function buildCharterLines(offer: RestOffer, currency: string, priceMinor: number): QuoteLine[] {
  const base = (amountMinor: number): QuoteLine => ({
    code: "base-charter",
    label: DEFAULT_LABELS.base,
    amount: { amountMinor, currency },
    payWhen: "now",
    kind: "base",
  });
  const discount = (code: string, label: string, amountMinor: number): QuoteLine => ({
    code,
    label,
    amount: { amountMinor: -amountMinor, currency },
    payWhen: "now",
    kind: "discount",
  });

  if (offer.startPrice == null) return [base(priceMinor)];
  const startPriceMinor = numberToMinor(offer.startPrice, currency, "startPrice");
  const discountMinor = startPriceMinor - priceMinor;
  if (discountMinor <= 0) return [base(priceMinor)];

  const named = namedDiscounts(offer, currency);
  const namedMinor = named.reduce((total, entry) => total + entry.amountMinor, 0);
  if (named.length > 0 && Math.abs(discountMinor - namedMinor) <= named.length) {
    const largest = named.reduce((top, entry) =>
      entry.amountMinor > top.amountMinor ? entry : top,
    );
    largest.amountMinor += discountMinor - namedMinor;
    return [
      base(startPriceMinor),
      ...named.map((entry) => discount(entry.code, entry.label, entry.amountMinor)),
    ];
  }

  if (offer.discountPercentage) {
    const expected = Math.round((startPriceMinor * offer.discountPercentage) / 100);
    if (Math.abs(expected - discountMinor) <= 1) {
      return [
        base(startPriceMinor),
        discount("bm-discount", DEFAULT_LABELS.discount, discountMinor),
      ];
    }
  }

  return [base(priceMinor)];
}

interface NamedDiscount {
  code: string;
  label: string;
  amountMinor: number;
}

/** The offer's itemised discounts, or none where any one of them cannot be read as a reduction. */
function namedDiscounts(offer: RestOffer, currency: string): NamedDiscount[] {
  const entries = offer.discounts ?? [];
  const named: NamedDiscount[] = [];
  for (const [index, entry] of entries.entries()) {
    if (entry.price == null || (entry.currency && entry.currency !== currency)) return [];
    const amountMinor = numberToMinor(entry.price, currency, "discounts[].price");
    if (amountMinor <= 0) return [];
    named.push({
      code: `bm-discount-${entry.id ?? index + 1}`,
      label: entry.name?.trim() || DEFAULT_LABELS.discount,
      amountMinor,
    });
  }
  return named;
}

/**
 * The charter price is the whole base, per the vendor: obligatory extras are
 * excluded, so this cannot be derived from the running subtotal. Rounded half-up
 * on the minor unit, which is what reconciled against `obligatoryExtrasPrice`.
 */
function percentageOfCharter(offer: RestOffer, percentage: number, currency: string): number {
  if (offer.price == null) {
    throw new ContractError(
      `Booking Manager offer for yacht ${offer.yachtId} carries a percentage extra but no charter price to take it on`,
      { endpoint: bookingManagerEndpoints.offers, providerCode: "PERCENTAGE_EXTRA" },
    );
  }
  return Math.round((customerPriceMinor(offer, offer.price, currency) * percentage) / 100);
}

function toExtraLine(
  extra: RestExtras,
  currency: string,
  offer: RestOffer,
  input: OfferMapping,
): QuoteLine {
  const externalId = String(extra.id ?? extra.name ?? "unknown");

  if (extra.currency && extra.currency !== currency) {
    throw new ContractError(
      `Booking Manager extra ${externalId} is priced in ${extra.currency}, the charter in ${currency}`,
      { endpoint: bookingManagerEndpoints.offers },
    );
  }
  // A `kind: 0` extra leaves `price` at zero and carries its value in
  // `percentage`, taken on the charter price alone - the other obligatory extras
  // are NOT in the base (Diego Pacifico, MMK, 2026-08-25; undocumented). Reading
  // `price` here would bill nothing at all.
  //
  // The rounded figure is not merely trusted: `mapOfferToProviderQuote` asserts
  // every extra line against the vendor's own `obligatoryExtrasPrice`, so a
  // wrong base or a wrong rounding direction fails the quote rather than
  // mispricing it.
  if (extra.kind === BM_EXTRA_KIND.PERCENTAGE) {
    if (extra.percentage == null) {
      throw new ContractError(
        `Booking Manager obligatory extra ${externalId} on yacht ${offer.yachtId} is priced as a percentage but carries none`,
        { endpoint: bookingManagerEndpoints.offers, providerCode: "PERCENTAGE_EXTRA" },
      );
    }
    return withNote(
      {
        code: formatExtraCode(EXTRA_KIND, externalId),
        label: input.labelFor?.(externalId) ?? extra.name?.trim() ?? DEFAULT_LABELS.extra,
        amount: { amountMinor: percentageOfCharter(offer, extra.percentage, currency), currency },
        payWhen: extra.payableInBase ? "at_check_in" : "now",
        kind: "extra",
        group: "mandatory",
      },
      extra,
    );
  }
  if (extra.price == null) {
    throw new ContractError(
      `Booking Manager obligatory extra ${externalId} on yacht ${offer.yachtId} carries no price`,
      { endpoint: bookingManagerEndpoints.offers },
    );
  }

  // `price` is the line total for the period, never a unit price: the vendor has
  // already multiplied by the `passengersOnBoard` we sent. Verified against the
  // live `/offers` on 2026-08-20 by re-reading one yacht at 1/2/4/6/8 passengers,
  // where a per-person extra came back at 70, 140, 280, 420, 560 while the base
  // price held. Multiplying by `guests` here would double-count the headcount.
  return withNote(
    {
      code: formatExtraCode(EXTRA_KIND, externalId),
      label: input.labelFor?.(externalId) ?? extra.name?.trim() ?? DEFAULT_LABELS.extra,
      amount: {
        amountMinor: numberToMinor(extra.price, currency, `extra ${externalId}`),
        currency,
      },
      // Settled with the base on arrival: it counts toward the total but never
      // toward what we collect now.
      payWhen: extra.payableInBase ? "at_check_in" : "now",
      kind: "extra",
      group: "mandatory",
    },
    extra,
  );
}

/** The operator's own terms for the charge, as plain text; the catalogue files the same note. */
function withNote(line: QuoteLine, extra: RestExtras): QuoteLine {
  const note = stripHtml(text(extra.description));
  if (note) line.note = note;
  return line;
}

function sumMinor(lines: readonly QuoteLine[]): number {
  return lines.reduce((total, line) => total + line.amount.amountMinor, 0);
}

function securityDepositOf(offer: RestOffer, currency: string): Money | undefined {
  if (offer.securityDeposit == null) {
    return undefined;
  }
  return {
    amountMinor: numberToMinor(offer.securityDeposit, currency, "securityDeposit"),
    currency,
  };
}

/* ---------------------------------------------------------------- policies */

interface ResolvedPaymentPolicy {
  policy: PaymentPolicy;
  depositMinor: number;
}

/**
 * Booking Manager schedules instalments as amounts rather than percentages, so
 * the deposit is taken from the plan verbatim and the percentage is derived for
 * the canonical policy, never the other way round: rebuilding an amount from a
 * rounded percentage would bill a figure the vendor never asked for.
 *
 * A plan of three or more is collapsed on purpose into the first instalment and one balance due
 * on the second one's date. The policy has room for a deposit and a balance only, as has
 * everything that collects against it (schedule, reminders, Stripe), and the earliest date is
 * the safe one: we never owe the operator an instalment we have not yet collected. The service
 * logs each collapse, so how often it happens is measured rather than guessed.
 */
function toPaymentPolicy(
  offer: RestOffer,
  currency: string,
  payableNowMinor: number,
): ResolvedPaymentPolicy {
  const plan = (offer.paymentPlan ?? []).filter((entry) => entry.amount != null);
  const [first, second] = plan;

  if (!first || first.amount == null || plan.length <= 1) {
    return { policy: { mode: "full", depositPct: 1 }, depositMinor: payableNowMinor };
  }

  const depositMinor = numberToMinor(first.amount, currency, "paymentPlan[0].amount");
  const planTotalMinor = plan.reduce(
    (total, entry) => total + numberToMinor(entry.amount ?? 0, currency, "paymentPlan[].amount"),
    0,
  );

  if (planTotalMinor <= 0 || depositMinor <= 0 || depositMinor > planTotalMinor) {
    throw new ContractError(
      `Booking Manager payment plan for yacht ${offer.yachtId} is inconsistent: ${depositMinor} of ${planTotalMinor}`,
      { endpoint: bookingManagerEndpoints.offers },
    );
  }

  if (depositMinor === planTotalMinor) {
    return { policy: { mode: "full", depositPct: 1 }, depositMinor };
  }

  const policy: PaymentPolicy = {
    mode: "deposit",
    depositPct: depositMinor / planTotalMinor,
  };
  if (second?.date) policy.balanceDueAt = parseBookingManagerDate(second.date);
  return { policy, depositMinor };
}

/**
 * Hashed over the price-relevant subset only. Echo fields such as the base names
 * and `myReservationId` can move without the price moving and would invalidate a
 * quote for no reason; every field below changes what the customer pays. The
 * substituted check-in/check-out times are included because they are part of what
 * was offered, and a base that moved its turnaround changes the charter.
 */
function priceObservationHash(offer: RestOffer, currency: string): string {
  return stableSourceHash({
    yachtId: offer.yachtId,
    dateFrom: offer.dateFrom ?? null,
    dateTo: offer.dateTo ?? null,
    product: offer.product ?? null,
    currency,
    price: offer.price ?? null,
    startPrice: offer.startPrice ?? null,
    discountPercentage: offer.discountPercentage ?? null,
    obligatoryExtrasPrice: offer.obligatoryExtrasPrice ?? null,
    obligatoryExtras: (offer.obligatoryExtras ?? [])
      .map((extra) => ({
        id: extra.id ?? null,
        name: extra.name ?? null,
        price: extra.price ?? null,
        currency: extra.currency ?? null,
        payableInBase: extra.payableInBase ?? null,
      }))
      .sort((a, b) => {
        const left = String(a.id ?? a.name ?? "");
        const right = String(b.id ?? b.name ?? "");
        return left < right ? -1 : left > right ? 1 : 0;
      }),
    /*
     * Order is semantic: the first instalment is the deposit, and its date is dropped.
     *
     * That date is not a term of the offer, it is a clock reading. The vendor stamps the
     * pay-now instalment with the moment it answered — two identical `/offers` calls eleven
     * seconds apart came back `2026-08-25 10:07:18` and `2026-08-25 10:07:29` on an otherwise
     * byte-identical offer — so hashing it made the fingerprint change on every read. Every
     * `createHold` against a pay-in-full yacht was refused with PRICE_CHANGED for a price
     * that had not moved, which is the whole checkout for company 225.
     *
     * Only the first is dropped, and only its date. A later instalment's date is a real due
     * date the customer is agreeing to — `toPaymentPolicy` reads exactly that one into
     * `balanceDueAt` — and it moving is a change worth refusing a stale quote over. This
     * mirrors what the policy mapper already does: it takes the first entry's amount and
     * never its date.
     */
    paymentPlan: (offer.paymentPlan ?? []).map((entry, index) => ({
      date: index === 0 ? null : (entry.date ?? null),
      amount: entry.amount ?? null,
    })),
    securityDeposit: offer.securityDeposit ?? null,
  });
}
