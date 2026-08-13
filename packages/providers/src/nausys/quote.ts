import type { z } from "zod";

import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { formatNausysDate, parseNausysDate } from "../shared/dates";
import { ContractError, SlotUnavailableError } from "../shared/errors";
import { decimalStringToMinor } from "../shared/money";
import { toPositiveIntId } from "../shared/projection-helpers";
import { stableSourceHash } from "../shared/raw-retention";
import {
  providerQuoteSchema,
  quoteRequestSchema,
  type CrewType,
  type Money,
  type ProviderQuote,
  type QuoteRequest,
} from "../types";
import type { NausysClient } from "./client";
import type { NausysConfig } from "./config";
import {
  nausysEndpoints,
  type restFreeYachtSchema,
  restFreeYachtsRequestSchema,
  restFreeYachtsResponseSchema,
} from "./endpoints";

type RestFreeYacht = z.infer<typeof restFreeYachtSchema>;
type RestExtra = NonNullable<RestFreeYacht["obligatoryExtras"]>[number];
type RestDiscount = NonNullable<RestFreeYacht["price"]["discounts"]>[number];
type QuoteLine = ProviderQuote["lines"][number];
type PaymentPolicy = ProviderQuote["paymentPolicy"];

/** PAYMENT_PLAN carries the instalment schedule, ADDITIONAL_EXTRAS the optional services. */
const EXTENDED_DATA_SET = "PAYMENT_PLAN,ADDITIONAL_EXTRAS";

const DEFAULT_QUOTE_TTL_MS = 15 * 60 * 1000;

/** Labels are catalogue data; this is what a quote reads when nothing supplies them. */
const DEFAULT_LABELS = {
  base: "Charter price",
  service: "Charter extra",
  discount: "Charter discount",
} as const;

export type NausysLabelKind = "service" | "discount";

export interface NausysQuoteServiceOptions {
  client: NausysClient;
  resolver: CatalogueResolver;
  config: NausysConfig;
  /**
   * How long our quote stays valid. A NauSYS quote is a price observation, not a
   * hold: `freeYachts` grants nothing, so this TTL is a promise we make on our
   * own account and the slot can be sold to someone else a second after we read
   * it.
   */
  quoteTtlMs?: number;
  /**
   * Shares one `freeYachts` response between quotes on the same yacht and period.
   * Off by default: the vendor allows one request at a time, so caching buys lane
   * capacity, but a quote is the moment we least want a stale price. The booking
   * chain re-prices through its own path and must not read a cached observation.
   */
  cacheTtlMs?: number;
  /**
   * Fallback only. Production `freeYachts` does return `price.depositAmount` for
   * the period, and that is preferred: it is the figure the operator will actually
   * hold for these dates, where the catalogue value is a yacht-level default. This
   * covers an offer that omits it.
   */
  loadSecurityDeposit?: (listingId: string) => Promise<Money | undefined>;
  /** Resolves a vendor service or discount id to a customer-facing line label. */
  labelFor?: (kind: NausysLabelKind, externalId: string) => string | undefined;
  now?: () => number;
}

export interface NausysQuoteService {
  getNausysQuote(input: QuoteRequest): Promise<ProviderQuote>;
}

export function createNausysQuoteService(options: NausysQuoteServiceOptions): NausysQuoteService {
  const { client, resolver, config } = options;
  const quoteTtlMs = options.quoteTtlMs ?? DEFAULT_QUOTE_TTL_MS;
  const cacheTtlMs = options.cacheTtlMs ?? 0;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { yacht: RestFreeYacht; readAt: number }>();

  async function readFreeYacht(
    yachtId: number,
    periodFrom: string,
    periodTo: string,
    currency: string,
  ): Promise<RestFreeYacht> {
    // Keyed by credential: agency pricing is per account, so two credentials must
    // never see each other's numbers.
    const cacheKey = `${config.queueKey}|${yachtId}|${periodFrom}|${periodTo}|${currency}`;
    const cached = cache.get(cacheKey);
    if (cached && now() - cached.readAt < cacheTtlMs) {
      return cached.yacht;
    }

    const request = restFreeYachtsRequestSchema.omit({ credentials: true }).parse({
      periodFrom,
      periodTo,
      yachts: [yachtId],
      currency,
      extendedDataSet: EXTENDED_DATA_SET,
    });

    const response = await client.bookingCall(
      nausysEndpoints.availability.freeYachts,
      restFreeYachtsResponseSchema,
      { ...request },
    );

    const yacht = (response.freeYachts ?? []).find((entry) => entry.yachtId === yachtId);
    // An empty list is how the vendor says "not free in that period": there is no
    // separate unavailable status, and no other reading of it is safe.
    if (!yacht) {
      throw new SlotUnavailableError(
        `NauSYS yacht ${yachtId} is not free from ${periodFrom} to ${periodTo}`,
        { endpoint: nausysEndpoints.availability.freeYachts, providerCode: "NO_FREE_YACHT" },
      );
    }
    if (yacht.status !== "FREE") {
      throw new SlotUnavailableError(
        `NauSYS yacht ${yachtId} is ${yacht.status} from ${periodFrom} to ${periodTo}`,
        { endpoint: nausysEndpoints.availability.freeYachts, providerCode: yacht.status },
      );
    }

    if (cacheTtlMs > 0) {
      cache.set(cacheKey, { yacht, readAt: now() });
    }
    return yacht;
  }

  return {
    async getNausysQuote(input: QuoteRequest): Promise<ProviderQuote> {
      const parsed = quoteRequestSchema.parse(input);
      const ref = await resolver.toExternalListing(parsed.listingId);
      const yachtId = toPositiveIntId(ref.externalYachtId, {
        provider: "NauSYS",
        what: "the yacht id",
      });

      const yacht = await readFreeYacht(
        yachtId,
        formatNausysDate(parsed.checkIn),
        formatNausysDate(parsed.checkOut),
        parsed.currency,
      );

      // The offer's own deposit wins over the catalogue default; see the option's
      // docstring. Read before the fallback so a present value costs no extra work.
      const offered = yacht.price.depositAmount;
      const securityDeposit =
        offered === undefined
          ? await options.loadSecurityDeposit?.(parsed.listingId)
          : {
              amountMinor: decimalStringToMinor(offered, yacht.price.currency),
              currency: yacht.price.currency,
            };

      return mapFreeYachtToProviderQuote({
        yacht,
        listingId: parsed.listingId,
        checkIn: parsed.checkIn,
        checkOut: parsed.checkOut,
        guests: parsed.guests,
        crewType: parsed.crewType,
        securityDeposit,
        expiresAt: new Date(now() + quoteTtlMs).toISOString(),
        labelFor: options.labelFor,
      });
    },
  };
}

export interface FreeYachtMapping {
  yacht: RestFreeYacht;
  listingId: string;
  /** ISO `yyyy-MM-dd`, ours; the vendor's `dd.MM.yyyy` echo is checked against it. */
  checkIn: string;
  checkOut: string;
  guests: number;
  /**
   * Echoed only. NauSYS prices crew as ordinary services out of the
   * ADDITIONAL_EXTRAS catalogue, and this adapter does not map optional services
   * onto lines yet, so a crew choice does not move the vendor's number.
   */
  crewType?: CrewType | undefined;
  securityDeposit?: Money | undefined;
  expiresAt: string;
  labelFor?: ((kind: NausysLabelKind, externalId: string) => string | undefined) | undefined;
}

/** Pure `RestFreeYacht → ProviderQuote`. No I/O, no clock, no vendor field beyond this file. */
export function mapFreeYachtToProviderQuote(input: FreeYachtMapping): ProviderQuote {
  const { yacht } = input;

  assertEchoedPeriod(yacht, input.checkIn, input.checkOut);

  const currency = yacht.price.currency;
  const listPriceMinor = decimalStringToMinor(yacht.price.priceListPrice, currency);
  const clientPriceMinor = decimalStringToMinor(yacht.price.clientPrice, currency);

  const charterLines = buildCharterLines(yacht, currency, listPriceMinor, clientPriceMinor, input);
  const extraLines = (yacht.obligatoryExtras ?? []).map((extra) =>
    toExtraLine(extra, currency, input),
  );
  const lines = [...charterLines, ...extraLines];

  // Computed from the vendor's own numbers rather than from the lines, so the
  // assertion below is a real check on how we built them.
  const totalMinor = clientPriceMinor + sumMinor(extraLines);
  if (sumMinor(lines) !== totalMinor) {
    throw new ContractError(
      `NauSYS quote lines for yacht ${yacht.yachtId} sum to ${sumMinor(lines)}, expected ${totalMinor}`,
      { endpoint: nausysEndpoints.availability.freeYachts },
    );
  }

  const paymentPolicy = toPaymentPolicy(yacht.paymentPlans, yacht.yachtId);
  const payableNowMinor = sumMinor(lines.filter((line) => line.payWhen === "now"));
  const depositMinor =
    paymentPolicy.mode === "full"
      ? payableNowMinor
      : Math.round(payableNowMinor * paymentPolicy.depositPct);

  const priceSourceHash = priceObservationHash(yacht, input.securityDeposit);

  return providerQuoteSchema.parse({
    // freeYachts creates nothing provider-side, so there is no vendor quote id to
    // carry: this identifies our observation and must never be sent to NauSYS.
    id: `nausys_${yacht.yachtId}_${priceSourceHash.slice(0, 16)}`,
    provider: "nausys",
    listingId: input.listingId,
    providerSourceId: `nausys:${yacht.yachtId}`,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    guests: input.guests,
    crewType: input.crewType ?? null,
    currency,
    lines,
    total: { amountMinor: totalMinor, currency },
    deposit: { amountMinor: depositMinor, currency },
    securityDeposit: input.securityDeposit,
    paymentPolicy,
    priceSourceHash,
    // `QuoteRequest` carries no expected price, so the adapter has nothing to
    // compare against; `repriceQuote` sets this itself when the caller asked for
    // a reprice.
    repriced: false,
    expiresAt: input.expiresAt,
  });
}

/* ------------------------------------------------------------------- lines */

/**
 * `clientPrice` is already net of the vendor's discounts (`priceListPrice` minus
 * each `discounts[]` entry in order). Emitting them as negative lines on top of a
 * `clientPrice` base would discount the trip twice, so the base line carries the
 * list price and the discounts bring it back down to `clientPrice`.
 *
 * When the arithmetic does not land exactly on `clientPrice` the vendor is doing
 * something we do not model. `clientPrice` then wins, because it is the only
 * number NauSYS bills against: the base becomes `clientPrice` and the discounts
 * are dropped from the quote rather than guessed at. They stay in the raw payload.
 */
function buildCharterLines(
  yacht: RestFreeYacht,
  currency: string,
  listPriceMinor: number,
  clientPriceMinor: number,
  input: FreeYachtMapping,
): QuoteLine[] {
  const discounts = yacht.price.discounts ?? [];
  const discountLines: QuoteLine[] = [];

  let running = listPriceMinor;
  for (const discount of discounts) {
    const amountMinor = discountAmountMinor(discount, running, currency);
    running -= amountMinor;
    discountLines.push({
      code: `nausys-discount-${discount.discountItemId}`,
      label: labelOf(input, "discount", String(discount.discountItemId), DEFAULT_LABELS.discount),
      amount: { amountMinor: -amountMinor, currency },
      payWhen: "now",
      kind: "discount",
    });
  }

  if (discountLines.length === 0 || running !== clientPriceMinor) {
    return [baseLine(clientPriceMinor, currency)];
  }
  return [baseLine(listPriceMinor, currency), ...discountLines];
}

function baseLine(amountMinor: number, currency: string): QuoteLine {
  return {
    code: "base-charter",
    label: DEFAULT_LABELS.base,
    amount: { amountMinor, currency },
    payWhen: "now",
    kind: "base",
  };
}

function discountAmountMinor(
  discount: RestDiscount,
  runningMinor: number,
  currency: string,
): number {
  // Percentages apply to what is left after the previous discount, which is the
  // only order that reproduces the vendor's own `clientPrice` on multi-discount
  // offers.
  if (discount.type === "PERCENTAGE") {
    const percentage = Number(discount.amount);
    if (!Number.isFinite(percentage)) {
      throw new ContractError(
        `NauSYS discount ${discount.discountItemId} has a non-numeric percentage`,
      );
    }
    return Math.round((runningMinor * percentage) / 100);
  }
  if (discount.type === "AMOUNT") {
    return decimalStringToMinor(String(discount.amount), currency);
  }
  throw new ContractError(
    `Unknown NauSYS discount type ${JSON.stringify(discount.type)} on item ${discount.discountItemId}`,
  );
}

/** `quantity` is a decimal string ("1.00", "10.00"); absent or unreadable is one. */
function quantityOf(extra: RestExtra): number {
  if (extra.quantity === undefined) return 1;
  const parsed = Number(extra.quantity.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/** Obligatory extras carry `serviceId`, additional ones `extraId`. */
function extraKey(extra: RestExtra): string {
  return String(extra.serviceId ?? extra.extraId ?? "unknown");
}

function toExtraLine(extra: RestExtra, currency: string, input: FreeYachtMapping): QuoteLine {
  if (extra.currency !== currency) {
    throw new ContractError(
      `NauSYS service ${extraKey(extra)} is priced in ${extra.currency}, the charter in ${currency}`,
    );
  }

  // The vendor's own line total, where it exists. Production always sends it, and
  // rounding a unit price is their decision rather than ours.
  //
  // Where it does not, the vendor's two accounts disagree and we refuse to guess.
  // NauSYS told us (Aug 2026) that `amount` is a unit price "without calculated
  // quantity", but the example in their own documentation, which this fixture
  // mirrors, adds a `quantity: 10` extra to `totalPriceWithExtras` at one times
  // `amount`. Multiplying would overcharge if the documentation is right; not
  // multiplying would undercharge if the answer is. A quantity of one is the same
  // number either way, so only a multi-unit extra with no total is ambiguous, and
  // that fails loudly rather than billing a number nobody can vouch for. This is
  // the same stance as the unknown `calculationType` below.
  const amountMinor = decimalStringToMinor(extra.amount, currency);
  const quantity = quantityOf(extra);

  if (extra.totalPrice === undefined && quantity !== 1) {
    throw new ContractError(
      `NauSYS service ${extraKey(extra)} has quantity ${quantity} and no totalPrice, ` +
        "so the line total is ambiguous",
      { payload: { amount: extra.amount, quantity: extra.quantity } },
    );
  }

  const lineMinor =
    extra.totalPrice === undefined ? amountMinor : decimalStringToMinor(extra.totalPrice, currency);

  return {
    code: `nausys-service-${extraKey(extra)}`,
    label: labelOf(input, "service", extraKey(extra), DEFAULT_LABELS.service),
    amount: { amountMinor: lineMinor, currency },
    payWhen: payWhenFor(extra),
    kind: "extra",
    // Everything a NauSYS quote returns today is an obligatory extra; optional
    // services live in ADDITIONAL_EXTRAS and are not mapped onto lines yet.
    group: "mandatory",
  };
}

/**
 * ADVANCE_PAYMENT is settled with the operator before the charter and is part of
 * what we collect today; SEPARATE_PAYMENT is paid at the base on arrival. Reading
 * this backwards misstates what the customer owes now, so an unrecognized literal
 * fails rather than defaulting.
 */
function payWhenFor(extra: RestExtra): QuoteLine["payWhen"] {
  switch (extra.calculationType) {
    case "ADVANCE_PAYMENT":
      return "now";
    // Absent on some services; the vendor bills those at the base.
    case "SEPARATE_PAYMENT":
    case undefined:
      return "at_check_in";
    default:
      throw new ContractError(
        `Unknown NauSYS calculationType ${JSON.stringify(extra.calculationType)} on service ${extraKey(extra)}`,
      );
  }
}

function labelOf(
  input: FreeYachtMapping,
  kind: NausysLabelKind,
  externalId: string,
  fallback: string,
): string {
  return input.labelFor?.(kind, externalId) ?? fallback;
}

function sumMinor(lines: readonly QuoteLine[]): number {
  return lines.reduce((total, line) => total + line.amount.amountMinor, 0);
}

/* ---------------------------------------------------------------- policies */

/**
 * The instalment split is the vendor's, per yacht and per period. Nothing here
 * falls back to a house 50/100: a hardcoded percentage would silently overcharge
 * or undercharge on every operator that does not use it.
 */
function toPaymentPolicy(plans: RestFreeYacht["paymentPlans"], yachtId: number): PaymentPolicy {
  const [first, second] = plans ?? [];
  if (!first) {
    return { mode: "full", depositPct: 1 };
  }

  const depositPct = first.percentage / 100;
  if (!Number.isFinite(depositPct) || depositPct <= 0 || depositPct > 1) {
    throw new ContractError(
      `NauSYS payment plan for yacht ${yachtId} opens with ${first.percentage}%`,
    );
  }
  if (depositPct === 1) {
    return { mode: "full", depositPct: 1 };
  }

  return {
    mode: "deposit",
    depositPct,
    ...(second ? { balanceDueAt: parseNausysDate(second.date) } : {}),
  };
}

function assertEchoedPeriod(yacht: RestFreeYacht, checkIn: string, checkOut: string): void {
  const from = parseNausysDate(yacht.periodFrom);
  const to = parseNausysDate(yacht.periodTo);
  if (from !== checkIn || to !== checkOut) {
    throw new ContractError(
      `NauSYS priced ${from}..${to} for yacht ${yacht.yachtId}, we asked for ${checkIn}..${checkOut}`,
      { endpoint: nausysEndpoints.availability.freeYachts },
    );
  }
}

/**
 * Hashed over the price-relevant subset only. The whole response would drag in
 * vendor echo fields and the optional-extras catalogue, either of which can move
 * without the price moving and would then invalidate a quote for no reason;
 * conversely every field below changes what the customer pays, so a change here
 * has to change the hash. Discount and payment-plan order is preserved because it
 * is semantic: discounts apply in sequence, and the first plan is the deposit.
 */
function priceObservationHash(yacht: RestFreeYacht, securityDeposit: Money | undefined): string {
  return stableSourceHash({
    yachtId: yacht.yachtId,
    periodFrom: yacht.periodFrom,
    periodTo: yacht.periodTo,
    status: yacht.status,
    currency: yacht.price.currency,
    priceListPrice: yacht.price.priceListPrice,
    clientPrice: yacht.price.clientPrice,
    discounts: (yacht.price.discounts ?? []).map((discount) => ({
      discountItemId: discount.discountItemId,
      amount: String(discount.amount),
      type: discount.type,
    })),
    obligatoryExtras: (yacht.obligatoryExtras ?? [])
      .map((extra) => ({
        serviceId: extra.serviceId ?? extra.extraId ?? 0,
        // Both, not just whichever we billed. A unit price that moves while the
        // total holds still means the vendor changed something about this line, and
        // a re-quote is cheap next to serving a stale one.
        amount: extra.amount,
        totalPrice: extra.totalPrice ?? null,
        quantity: extra.quantity ?? null,
        currency: extra.currency,
        calculationType: extra.calculationType ?? null,
      }))
      .sort((a, b) => a.serviceId - b.serviceId),
    paymentPlans: (yacht.paymentPlans ?? []).map((plan) => ({
      date: plan.date,
      percentage: plan.percentage,
    })),
    securityDepositMinor: securityDeposit?.amountMinor ?? null,
  });
}
