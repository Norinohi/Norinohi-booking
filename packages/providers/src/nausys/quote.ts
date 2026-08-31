import type { z } from "zod";

import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { formatNausysDate, parseNausysDate } from "../shared/dates";
import { ContractError, SlotUnavailableError } from "../shared/errors";
import { formatExtraCode, type ExtraKind } from "../shared/extra-code";
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
import { extraLineMinor, isIncludedInCharterPrice } from "./extras";
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

export type NausysLabelKind = "service" | "equipment" | "discount";

/** A crew role and the vendor service the operator sells it as. */
export interface CrewRoleService {
  role: "skipper" | "hostess" | "cook";
  externalId: string;
}

/**
 * Which roles a crew choice puts aboard, mirroring `crewOptionsFor` in the read
 * model. Bareboat and an unanswered control both mean nobody: a customer who has
 * not chosen must never be quoted for a skipper.
 */
function crewServiceIdsFor(
  roles: readonly CrewRoleService[],
  crewType: CrewType | undefined,
): string[] {
  if (!crewType || crewType === "bareboat") return [];
  const wanted = crewType === "skipper" ? roles.filter((item) => item.role === "skipper") : roles;
  return wanted.map((item) => item.externalId);
}

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
  /**
   * The listing's extras by canonical code, for naming the lines they price.
   * `freeYachts` sends ids and prices but no names, so without this every extra
   * on the quote read "Charter extra" — three of them on one booking, and the
   * customer approving a bill that never says what they bought.
   */
  loadExtraLabels?: (listingId: string) => Promise<ReadonlyMap<string, string>>;
  /**
   * The listing's crew roles and the vendor service each is sold as. NauSYS flags
   * no service as crew, so the roles were read off service names during the
   * catalogue sync and this reads them back. Without it a crew choice is echoed and
   * priced at nothing, which is what the adapter did before.
   */
  loadCrewRoles?: (listingId: string) => Promise<CrewRoleService[]>;
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

      const crewRoles = (await options.loadCrewRoles?.(parsed.listingId)) ?? [];
      const extraLabels = await options.loadExtraLabels?.(parsed.listingId);

      return mapFreeYachtToProviderQuote({
        yacht,
        listingId: parsed.listingId,
        checkIn: parsed.checkIn,
        checkOut: parsed.checkOut,
        guests: parsed.guests,
        crewType: parsed.crewType,
        extras: parsed.extras,
        crewServiceIds: crewServiceIdsFor(crewRoles, parsed.crewType),
        securityDeposit,
        expiresAt: new Date(now() + quoteTtlMs).toISOString(),
        /* The catalogue answers for extras; a discount has no catalogue row, and an
           extra the sync never recorded falls through to whatever the caller knows. */
        labelFor: (kind, externalId) =>
          (kind === "discount" ? undefined : extraLabels?.get(formatExtraCode(kind, externalId))) ??
          options.labelFor?.(kind, externalId),
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
   * Echoed, and priced when the catalogue knows which services are crew roles.
   * NauSYS sells crew as ordinary services out of ADDITIONAL_EXTRAS with no flag
   * marking them as such, so the caller resolves the roles and passes their ids
   * through `extras`; an unresolved crew type still moves nothing.
   */
  crewType?: CrewType | undefined;
  /**
   * Selected extras as canonical `kind:externalId` codes, matched against the
   * offer by `offerExtraIdentity`. Both id spaces are priced: an account that
   * sends the `extraId` shape names the space in `extrasType`, so an
   * `equipment:` code has something exact to match.
   */
  extras?: readonly string[] | undefined;
  /** Vendor service ids the chosen crew type puts aboard; priced as crew lines. */
  crewServiceIds?: readonly string[] | undefined;
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
  const obligatoryLines = (yacht.obligatoryExtras ?? []).map((extra) =>
    toExtraLine(extra, currency, input, "mandatory"),
  );
  /*
   * Crew is bought by choosing a crew type, not by ticking an extra, so it is
   * excluded from the optional selection: billing the same service twice is what
   * would happen if a customer ticked the skipper the crew control already added.
   */
  const crewCodes = new Set(
    (input.crewServiceIds ?? []).map((id) => formatExtraCode("service", id)),
  );
  const crew = additionalExtrasByCode(yacht, crewCodes);
  const selected = additionalExtrasByCode(
    yacht,
    new Set((input.extras ?? []).filter((code) => !crewCodes.has(code))),
  );
  const crewLines = crew.map((extra) => toExtraLine(extra, currency, input, "crew"));
  const selectedLines = selected.map((extra) => toExtraLine(extra, currency, input, "optional"));
  const extraLines = [...obligatoryLines, ...crewLines, ...selectedLines];
  const lines = [...charterLines, ...extraLines];

  // Computed from the vendor's own numbers rather than from the lines, so the
  // assertion below is a real check on how we built them. `clientPrice` covers the
  // charter and its obligatory extras only: an optional extra is something the
  // customer added on top, and the vendor never saw the choice.
  const totalMinor = clientPriceMinor + sumMinor(extraLines);
  if (sumMinor(lines) !== totalMinor) {
    throw new ContractError(
      `NauSYS quote lines for yacht ${yacht.yachtId} sum to ${sumMinor(lines)}, expected ${totalMinor}`,
      { endpoint: nausysEndpoints.availability.freeYachts },
    );
  }

  /*
   * Everything the offer could price, ticked or not, so the listing can grey out
   * the extras this period does not sell instead of accepting a choice that
   * quietly costs nothing. Crew stays in: the listing keeps crew roles out of its
   * optional extras entirely, so nothing downstream can offer them twice.
   */
  const offeredExtras = (yacht.additionalExtras ?? []).flatMap((extra) => {
    const identity = offerExtraIdentity(extra);
    /* An entry we cannot place, or cannot pay for in the charter's currency, is not
       on offer: leaving it out is also what keeps `toExtraLine` from ever meeting it. */
    if (identity.externalId === UNPLACEABLE_ID || extra.currency !== currency) return [];

    return [
      {
        code: formatExtraCode(identity.kind, identity.externalId),
        amount: { amountMinor: extraLineMinor(extra, currency), currency },
        payWhen: payWhenFor(extra),
      },
    ];
  });

  const paymentPolicy = toPaymentPolicy(yacht.paymentPlans, yacht.yachtId);
  const payableNowMinor = sumMinor(lines.filter((line) => line.payWhen === "now"));
  const depositMinor =
    paymentPolicy.mode === "full"
      ? payableNowMinor
      : Math.round(payableNowMinor * paymentPolicy.depositPct);

  // Crew as well as the ticked extras: both are billed, so a move in either has to
  // invalidate the quote before checkout takes money against it.
  const priceSourceHash = priceObservationHash(yacht, input.securityDeposit, [
    ...crew,
    ...selected,
  ]);

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
    offeredExtras,
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

/** Stands in for an entry in neither documented shape; no selection can equal it. */
const UNPLACEABLE_ID = "unknown";

/** What an offer entry is, in the one identity the rest of the system knows it by. */
interface OfferExtraIdentity {
  kind: ExtraKind;
  externalId: string;
}

/**
 * Which id space `extraId` belongs to. An unrecognised value is not a guess to
 * make: billing the customer for whichever service happened to share the number
 * is the failure this naming prevents.
 */
function extrasKindOf(extrasType: string | undefined): ExtraKind | null {
  const named = extrasType?.trim().toUpperCase();
  if (named === "SERVICE") return "service";
  if (named === "EQUIPMENT") return "equipment";
  return null;
}

/**
 * The canonical `kind:externalId` an offer entry answers to — the same string the
 * catalogue stores and the customer submits.
 *
 * The response keys its two halves differently, as `restExtraSchema` has always
 * said: an obligatory extra carries `serviceId`, an additional one carries
 * `extraId` alongside `extrasType`. Reading only `serviceId` was right for the
 * recorded fixture and wrong on the live account, which sends every additional
 * extra in the second shape — so nothing a customer ticked ever matched, and the
 * selection was dropped from the quote without a word. Both shapes now resolve.
 *
 * An entry in neither shape resolves to `service:unknown`, which no selection can
 * equal: it is priced only where the vendor itself made it obligatory.
 */
function offerExtraIdentity(extra: RestExtra): OfferExtraIdentity {
  if (extra.serviceId !== undefined) {
    return { kind: "service", externalId: String(extra.serviceId) };
  }

  const kind = extra.extraId === undefined ? null : extrasKindOf(extra.extrasType);
  if (kind === null) return { kind: "service", externalId: UNPLACEABLE_ID };

  return { kind, externalId: String(extra.extraId) };
}

function offerExtraCode(extra: RestExtra): string {
  const { kind, externalId } = offerExtraIdentity(extra);
  return formatExtraCode(kind, externalId);
}

function additionalExtrasByCode(yacht: RestFreeYacht, wanted: ReadonlySet<string>): RestExtra[] {
  if (wanted.size === 0) return [];

  return (yacht.additionalExtras ?? []).filter((extra) => wanted.has(offerExtraCode(extra)));
}

function toExtraLine(
  extra: RestExtra,
  currency: string,
  input: FreeYachtMapping,
  group: NonNullable<QuoteLine["group"]>,
): QuoteLine {
  const identity = offerExtraIdentity(extra);
  /* Only a line that will be billed has a currency to disagree about: one the charter price
     already covers is quoted at zero, and refusing it would lose the listing over a figure
     nobody is charged. */
  if (extra.currency !== currency && !isIncludedInCharterPrice(extra)) {
    throw new ContractError(
      `NauSYS extra ${formatExtraCode(identity.kind, identity.externalId)} is priced in ${extra.currency}, the charter in ${currency}`,
    );
  }

  const lineMinor = extraLineMinor(extra, currency);

  return {
    // The canonical extra identity, the same string the listing page rendered and
    // the customer submitted. Keeping the namespaces aligned is what lets a
    // selection be reconciled against the line that priced it, and what makes
    // `booking_extra.code` mean the same thing as the code on screen.
    code: formatExtraCode(identity.kind, identity.externalId),
    label: labelOf(input, identity.kind, identity.externalId, DEFAULT_LABELS.service),
    amount: { amountMinor: lineMinor, currency },
    payWhen: payWhenFor(extra),
    kind: "extra",
    group,
  };
}

/**
 * ADVANCE_PAYMENT is settled with the operator before the charter and is part of
 * what we collect today; SEPARATE_PAYMENT is paid at the base on arrival. Reading
 * this backwards misstates what the customer owes now, so an unrecognized literal
 * fails rather than defaulting.
 *
 * INCLUDED_IN_PRICE is neither: the service is inside the charter price, which is collected on
 * our own schedule, so it takes the base line's `now` and `extraLineMinor` prices it at zero.
 * It used to reach the default and throw, which cost the whole listing rather than the line:
 * a ContractError out of the adapter is an errored offer, no winner, and a flat CONFLICT on
 * every date, so Altair Dufour 412 could not be quoted at all while NauSYS held it FREE.
 */
function payWhenFor(extra: RestExtra): QuoteLine["payWhen"] {
  switch (extra.calculationType) {
    case "ADVANCE_PAYMENT":
    case "INCLUDED_IN_PRICE":
      return "now";
    // Absent on some services; the vendor bills those at the base.
    case "SEPARATE_PAYMENT":
    case undefined:
      return "at_check_in";
    default:
      throw new ContractError(
        `Unknown NauSYS calculationType ${JSON.stringify(extra.calculationType)} on extra ${offerExtraCode(extra)}`,
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

  const policy: PaymentPolicy = { mode: "deposit", depositPct };
  if (second) policy.balanceDueAt = parseNausysDate(second.date);
  return policy;
}

/** Sorted so the vendor's ordering cannot change the hash on its own. */
function hashableExtras(extras: readonly RestExtra[]) {
  return extras
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
    .sort((a, b) => a.serviceId - b.serviceId);
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
 * vendor echo fields and the rest of the optional-extras catalogue, which can move
 * without this customer's price moving and would then invalidate a quote for no
 * reason; conversely every field below changes what the customer pays, so a change
 * here has to change the hash. Discount and payment-plan order is preserved because
 * it is semantic: discounts apply in sequence, and the first plan is the deposit.
 *
 * The exclusion of `additionalExtras` is narrowed rather than absolute: the ones
 * the customer actually selected are now billed, so their prices are as
 * price-relevant as an obligatory extra's, and a drift in one has to invalidate
 * the quote at hold time. The unselected remainder stays out, which is what the
 * original exclusion was really protecting against.
 */
function priceObservationHash(
  yacht: RestFreeYacht,
  securityDeposit: Money | undefined,
  selectedExtras: readonly RestExtra[] = [],
): string {
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
    obligatoryExtras: hashableExtras(yacht.obligatoryExtras ?? []),
    selectedExtras: hashableExtras(selectedExtras),
    paymentPlans: (yacht.paymentPlans ?? []).map((plan) => ({
      date: plan.date,
      percentage: plan.percentage,
    })),
    securityDepositMinor: securityDeposit?.amountMinor ?? null,
  });
}
