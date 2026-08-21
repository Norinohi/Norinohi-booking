import type { z } from "zod";

import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { ContractError, SlotUnavailableError } from "../shared/errors";
import { formatExtraCode } from "../shared/extra-code";
import { toExactPositiveIntId } from "../shared/projection-helpers";
import { stableSourceHash } from "../shared/raw-retention";
import {
  providerQuoteSchema,
  quoteRequestSchema,
  type CrewType,
  type Money,
  type ProviderQuote,
  type QuoteRequest,
} from "../types";
import type { BookingManagerClient } from "./client";
import type { BookingManagerConfig } from "./config";
import { formatBookingManagerDateTime, parseBookingManagerDate } from "./dates";
import { numberToMinor } from "./money";
import {
  bookingManagerEndpoints,
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

const DEFAULT_LABELS = {
  base: "Charter price",
  extra: "Charter extra",
  discount: "Charter discount",
} as const;

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
   * Maps the customer's crew choice to a Booking Manager product name. Products
   * are per-yacht catalogue data (`yacht.products[].name`), so no static table
   * can answer this; omitted means the vendor prices its default product.
   */
  productNameFor?: (crewType: CrewType) => string | undefined;
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
  now?: () => number;
}

export interface BookingManagerQuoteService {
  getBookingManagerQuote(input: QuoteRequest): Promise<ProviderQuote>;
}

export function createBookingManagerQuoteService(
  options: BookingManagerQuoteServiceOptions,
): BookingManagerQuoteService {
  const { client, resolver } = options;
  const quoteTtlMs = options.quoteTtlMs ?? DEFAULT_QUOTE_TTL_MS;
  const now = options.now ?? Date.now;

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
      const productName = parsed.crewType ? options.productNameFor?.(parsed.crewType) : undefined;

      // Midnight is mandatory here, not a placeholder: MMK confirmed the vendor
      // substitutes the base's own check-in/check-out time and returns it on the
      // offer, so sending a time of our own is refused or silently overridden.
      const offerQuery = {
        dateFrom: formatBookingManagerDateTime(parsed.checkIn),
        dateTo: formatBookingManagerDateTime(parsed.checkOut),
        yachtId: [yachtId],
        currency: parsed.currency,
        passengersOnBoard: parsed.guests,
        // An undefined value is dropped from the query string, so an unnamed
        // product asks for the vendor's default rather than for an empty one.
        productName: productName || undefined,
      };

      const offers = await client.get(
        bookingManagerEndpoints.offers,
        restOfferListSchema,
        offerQuery,
      );

      const offer = selectOffer(offers, yachtId, parsed.checkIn, parsed.checkOut, productName);
      if (!offer) {
        throw new SlotUnavailableError(
          `Booking Manager has no offer for yacht ${yachtId} from ${parsed.checkIn} to ${parsed.checkOut}`,
          { endpoint: bookingManagerEndpoints.offers, providerCode: "NO_OFFER" },
        );
      }

      const extraLabels = await options.loadExtraLabels?.(parsed.listingId);

      return mapOfferToProviderQuote({
        offer,
        listingId: parsed.listingId,
        checkIn: parsed.checkIn,
        checkOut: parsed.checkOut,
        guests: parsed.guests,
        crewType: parsed.crewType,
        requestedCurrency: parsed.currency,
        expiresAt: new Date(now() + quoteTtlMs).toISOString(),
        /* The catalogue answers first; an extra the sync never recorded falls
           through to whatever the caller knows. */
        labelFor: (externalId) =>
          extraLabels?.get(formatExtraCode(EXTRA_KIND, externalId)) ??
          options.labelFor?.(externalId),
      });
    },
  };
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
 */
export function selectOffer(
  offers: readonly RestOffer[],
  yachtId: string,
  checkIn: string,
  checkOut: string,
  productName: string | undefined,
): RestOffer | undefined {
  const candidates = offers.filter(
    (offer) =>
      offer.yachtId === yachtId &&
      offer.dateFrom != null &&
      offer.dateTo != null &&
      parseBookingManagerDate(offer.dateFrom) === checkIn &&
      parseBookingManagerDate(offer.dateTo) === checkOut,
  );

  const ofProduct = productName
    ? candidates.filter((offer) => offer.product === productName)
    : candidates;

  return rankOffers(ofProduct.length > 0 ? ofProduct : candidates)[0];
}

/** Same-base before one-way, then cheapest all-in. A stable sort keeps vendor order as the tie. */
function rankOffers(candidates: readonly RestOffer[]): RestOffer[] {
  return [...candidates].sort(
    (left, right) =>
      Number(isOneWay(left)) - Number(isOneWay(right)) || allInMinor(left) - allInMinor(right),
  );
}

function isOneWay(offer: RestOffer): boolean {
  return (
    offer.startBaseId != null && offer.endBaseId != null && offer.startBaseId !== offer.endBaseId
  );
}

/**
 * What the charter costs together, because the obligatory extras are the whole point: two offers
 * for this hull quote the same 809 EUR and differ by a 155 EUR fee attached to one of them.
 * A missing figure sorts last rather than as free.
 */
function allInMinor(offer: RestOffer): number {
  const price = offer.price ?? Number.MAX_SAFE_INTEGER;
  return price + (offer.obligatoryExtrasPrice ?? 0);
}

export interface OfferTimes {
  checkInTime: string | undefined;
  checkOutTime: string | undefined;
}

/** The base's own check-in/check-out wall clock, as the vendor substituted it. */
export function readOfferTimes(offer: RestOffer): OfferTimes {
  return { checkInTime: timeOf(offer.dateFrom), checkOutTime: timeOf(offer.dateTo) };
}

function timeOf(value: string | null | undefined): string | undefined {
  const time = value?.trim().split(/[ T]/)[1];
  return time === undefined || time === "" ? undefined : time;
}

export interface OfferMapping {
  offer: RestOffer;
  listingId: string;
  /** ISO `yyyy-MM-dd`, ours; the vendor's echo is checked against it. */
  checkIn: string;
  checkOut: string;
  guests: number;
  crewType?: CrewType | undefined;
  requestedCurrency: string;
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
   * The assertion below stays: it is what makes the reading falsifiable, and a
   * payload where the extras do not sum to the vendor's own subtotal should fail
   * here rather than mispricing a booking downstream.
   */
  const extrasMinor = sumMinor(extraLines);
  if (offer.obligatoryExtrasPrice != null) {
    const declared = numberToMinor(offer.obligatoryExtrasPrice, currency, "obligatoryExtrasPrice");
    if (declared !== extrasMinor) {
      throw new ContractError(
        `Booking Manager obligatory extras for yacht ${offer.yachtId} sum to ${extrasMinor}, declared ${declared}`,
        { endpoint: bookingManagerEndpoints.offers },
      );
    }
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
    // Calendar dates only. The wall-clock times the vendor substituted belong to
    // the base, not to the price, and `readOfferTimes` exposes them separately.
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: input.guests,
    crewType: input.crewType ?? null,
    currency,
    lines,
    total: { amountMinor: totalMinor, currency },
    deposit: { amountMinor: depositMinor, currency },
    paymentPolicy: policy,
    priceSourceHash,
    repriced: false,
    expiresAt: input.expiresAt,
  };
  if (securityDeposit) quoteInput.securityDeposit = securityDeposit;

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

/* ------------------------------------------------------------------- lines */

/**
 * `price` is already net of `discountPercentage`; `startPrice` is what the same
 * charter costs without it. The discount is shown as its own line only when the
 * two reconcile exactly, so a customer sees where the reduction came from. When
 * they do not, `price` wins and the discount is dropped from the quote rather
 * than guessed at: it is the only number the vendor bills against.
 */
function buildCharterLines(offer: RestOffer, currency: string, priceMinor: number): QuoteLine[] {
  const base = (amountMinor: number): QuoteLine => ({
    code: "base-charter",
    label: DEFAULT_LABELS.base,
    amount: { amountMinor, currency },
    payWhen: "now",
    kind: "base",
  });

  if (offer.startPrice == null || !offer.discountPercentage) {
    return [base(priceMinor)];
  }

  const startPriceMinor = numberToMinor(offer.startPrice, currency, "startPrice");
  const discountMinor = startPriceMinor - priceMinor;
  if (discountMinor <= 0) {
    return [base(priceMinor)];
  }

  const expected = Math.round((startPriceMinor * offer.discountPercentage) / 100);
  if (expected !== discountMinor) {
    return [base(priceMinor)];
  }

  return [
    base(startPriceMinor),
    {
      code: "bm-discount",
      label: DEFAULT_LABELS.discount,
      amount: { amountMinor: -discountMinor, currency },
      payWhen: "now",
      kind: "discount",
    },
  ];
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
  return {
    code: formatExtraCode(EXTRA_KIND, externalId),
    label: input.labelFor?.(externalId) ?? extra.name?.trim() ?? DEFAULT_LABELS.extra,
    amount: { amountMinor: numberToMinor(extra.price, currency, `extra ${externalId}`), currency },
    // Settled with the base on arrival: it counts toward the total but never
    // toward what we collect now.
    payWhen: extra.payableInBase ? "at_check_in" : "now",
    kind: "extra",
    group: "mandatory",
  };
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
    // Order is semantic: the first instalment is the deposit.
    paymentPlan: (offer.paymentPlan ?? []).map((entry) => ({
      date: entry.date ?? null,
      amount: entry.amount ?? null,
    })),
    securityDeposit: offer.securityDeposit ?? null,
  });
}
