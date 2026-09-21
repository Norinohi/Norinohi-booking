import { log } from "evlog";
import { z } from "zod";

import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { formatNausysDate, parseNausysDate } from "../shared/dates";
import { looseJsonObject } from "../shared/json";
import { ContractError, SlotUnavailableError } from "../shared/errors";
import {
  baseExtraCode,
  formatExtraCode,
  formatExtraVariantCode,
  type ExtraKind,
} from "../shared/extra-code";
import { DEFAULT_LINE_LABELS } from "../shared/generic-labels";
import { decimalStringToMinor } from "../shared/money";
import { toPositiveIntId } from "../shared/projection-helpers";
import { stableSourceHash } from "../shared/raw-retention";
import { wallClockTime } from "../shared/wall-clock";
import {
  providerQuoteSchema,
  type ProviderQuoteCommission,
  quoteRequestSchema,
  type CrewType,
  type Money,
  type ProviderQuote,
  type QuoteRequest,
} from "../types";
import type { NausysClient } from "./client";
import { walkDiscounts } from "./discounts";
import {
  extraLineMinor,
  internationalText,
  isIncludedInCharterPrice,
  type PercentageBasis,
} from "./extras";
import type { NausysConfig } from "./config";
import {
  nausysEndpoints,
  type restFreeYachtSchema,
  restFreeYachtsRequestSchema,
  restFreeYachtsResponseSchema,
} from "./endpoints";

type RestFreeYacht = z.infer<typeof restFreeYachtSchema>;
type RestExtra = NonNullable<RestFreeYacht["obligatoryExtras"]>[number];
type QuoteLine = ProviderQuote["lines"][number];
type PaymentPolicy = ProviderQuote["paymentPolicy"];

/**
 * PAYMENT_PLAN carries the instalment schedule, ADDITIONAL_EXTRAS the optional services, and
 * OBLIGATORY_SERVICES the mandatory fees, which the PDF exports "only if one yacht and one
 * period are requested", exactly what a quote asks. Obligatory extras used to come back only as a
 * side effect of ADDITIONAL_EXTRAS: on the test company (Sep 2026) PAYMENT_PLAN alone returns
 * none, so a vendor that started applying its own rule would have quoted every charter without
 * its tourist tax, transit log and cleaning.
 */
const EXTENDED_DATA_SET = "PAYMENT_PLAN,OBLIGATORY_SERVICES,ADDITIONAL_EXTRAS";

const DEFAULT_QUOTE_TTL_MS = 15 * 60 * 1000;

/** Labels are catalogue data; this is what a quote reads when nothing supplies them. */
const DEFAULT_LABELS = {
  base: DEFAULT_LINE_LABELS.base,
  service: DEFAULT_LINE_LABELS.extra,
  discount: DEFAULT_LINE_LABELS.discount,
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
/**
 * The offer's reduced deposit, where it really is one.
 *
 * The vendor sends this field as a bare 0 on most hulls and, on some, as a figure that is not
 * lower than the ordinary deposit. Read literally, the first promises a customer who bought
 * the insurance that nothing is blocked at the base and the second holds them to more than if
 * they had not bought it. Neither is what the operator meant, so both fall back to the
 * ordinary deposit. `reducedDepositOf` in the projection reads the catalogue's copy the same
 * way.
 */
function reducedDepositOf(price: RestFreeYacht["price"]): string | undefined {
  const insured = price.depositWhenInsuredAmount;
  if (insured === undefined) return undefined;

  const currency = price.currency;
  const insuredMinor = decimalStringToMinor(insured, currency);
  if (insuredMinor <= 0) return undefined;

  const deposit = price.depositAmount;
  if (deposit === undefined) return insured;
  return insuredMinor >= decimalStringToMinor(deposit, currency) ? undefined : insured;
}

/**
 * Whether this charter carries deposit insurance, which changes the deposit rather than the
 * price. Nothing is loaded when no extra is selected: the common case is an empty list.
 */
async function selectsDepositInsurance(
  options: { loadDepositInsuranceCodes?: (listingId: string) => Promise<ReadonlySet<string>> },
  request: { listingId: string; extras: readonly string[] },
): Promise<boolean> {
  if (request.extras.length === 0 || !options.loadDepositInsuranceCodes) return false;

  const codes = await options.loadDepositInsuranceCodes(request.listingId);
  return request.extras.some((code) => codes.has(baseExtraCode(code)));
}

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
  /**
   * The listing's deposit-insurance extras, by canonical code.
   *
   * An operator that sells one holds a smaller deposit when the charter carries it, and states
   * both figures on the offer. Without this the customer bought the insurance and was still
   * shown -- and asked at the base for -- the full deposit.
   */
  loadDepositInsuranceCodes?: (listingId: string) => Promise<ReadonlySet<string>>;
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
  /** The operator's bound on an agency's client discount for this yacht; see `DiscountRule`. */
  loadDiscountRule?: (listingId: string) => Promise<DiscountRule | undefined>;
  /**
   * Marina names by NauSYS location id, for the route a charter runs. `freeYachts` names the
   * start and end only by location id, and a one-way the operator fixed is something the
   * customer has to be told in words.
   */
  loadLocationNames?: (locationIds: readonly string[]) => Promise<ReadonlyMap<string, string>>;
  now?: () => number;
}

/**
 * `maxDiscountFromCommission` with the `agencyDiscountType` that says what it is a share of.
 * Always a fraction: across the 7,408 synced hulls every value lies between 0 and 1 (0.05 of
 * the client price, 1 of the commission), which is what settled the unit the vendor had not.
 */
export interface DiscountRule {
  basis: "CLIENT_PRICE" | "AGENCY_COMMISSION";
  fraction: number;
}

export interface NausysQuoteService {
  getNausysQuote(input: QuoteRequest): Promise<ProviderQuote>;
  /** The exact bound on our client discount; see `InventoryProvider.exactClientDiscountCap`. */
  getExactDiscountCap(quote: ProviderQuote): Promise<number | undefined>;
  /** The same quote, with the offer rows it bills, for the hold to put on the reservation. */
  getNausysQuoteWithRows(
    input: QuoteRequest,
  ): Promise<{ quote: ProviderQuote; billedRows: BilledExtraRow[] }>;
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
    guests: number,
  ): Promise<RestFreeYacht> {
    /* Keyed by credential: agency pricing is per account, so two credentials must never see
       each other's numbers. By party size too, since the vendor prices per-head extras from
       it and two guest counts are two different answers. */
    const cacheKey = `${config.queueKey}|${yachtId}|${periodFrom}|${periodTo}|${currency}|${guests}`;
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
      numberOfPersons: guests,
    });

    const response = await client.bookingCall(
      nausysEndpoints.availability.freeYachts,
      restFreeYachtsResponseSchema,
      { ...request },
    );

    const offered = preferredFreeYachtRow(
      (response.freeYachts ?? []).filter((entry) => entry.yachtId === yachtId),
    );
    const yacht = offered;
    /* Asked for by name, so an absent list (not an empty one) is the vendor saying nothing. */
    if (yacht && yacht.obligatoryExtras === undefined) {
      log.warn({ action: "nausys.quote_without_obligatory_extras", yachtId, periodFrom });
    }
    if (yacht && !isRoundTrip(yacht)) {
      log.warn({
        action: "nausys.quote_one_way_only",
        yachtId,
        periodFrom,
        locationFromId: yacht.locationFromId,
        locationToId: yacht.locationToId,
      });
    }
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

  async function mappingFor(input: QuoteRequest): Promise<FreeYachtMapping> {
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
      parsed.guests,
    );

    /*
     * The offer's own deposit wins over the catalogue default; see the option's docstring.
     * Read before the fallback so a present value costs no extra work.
     *
     * A charter carrying deposit insurance is held to the reduced figure the vendor sends
     * beside it -- the whole point of buying the insurance, and the number the base will
     * actually block on the card.
     */
    const insured = await selectsDepositInsurance(options, parsed);
    const offered =
      (insured ? reducedDepositOf(yacht.price) : undefined) ?? yacht.price.depositAmount;
    const securityDeposit =
      offered === undefined
        ? await options.loadSecurityDeposit?.(parsed.listingId)
        : {
            amountMinor: decimalStringToMinor(offered, yacht.price.currency),
            currency: yacht.price.currency,
          };

    const crewRoles = (await options.loadCrewRoles?.(parsed.listingId)) ?? [];
    const extraLabels = await options.loadExtraLabels?.(parsed.listingId);
    const locationIds = [yacht.locationFromId, yacht.locationToId].flatMap((id) =>
      id === undefined ? [] : [String(id)],
    );
    const locationNames =
      locationIds.length > 0 ? await options.loadLocationNames?.(locationIds) : undefined;

    return {
      yacht,
      listingId: parsed.listingId,
      checkIn: parsed.checkIn,
      checkOut: parsed.checkOut,
      guests: parsed.guests,
      crewType: parsed.crewType,
      extras: parsed.extras,
      crewServiceIds: crewServiceIdsFor(crewRoles, parsed.crewType),
      crewRoleServiceIds: crewRoles.map((item) => item.externalId),
      locationNames,
      discountRule: await options.loadDiscountRule?.(parsed.listingId),
      securityDeposit,
      expiresAt: new Date(now() + quoteTtlMs).toISOString(),
      /* The catalogue answers for extras; a discount has no catalogue row, and an
           extra the sync never recorded falls through to whatever the caller knows. */
      labelFor: (kind, externalId) =>
        (kind === "discount" ? undefined : extraLabels?.get(formatExtraCode(kind, externalId))) ??
        options.labelFor?.(kind, externalId),
    };
  }

  return {
    /*
     * A proposal, which the vendor answers "without ID" and does not store: the only place it
     * states the commission net of VAT that bounds an agency's client discount. Verified on the
     * test company (Sep 2026): 1,345.10 gross commission, 1,076.08 net, and a discount of
     * 1,076.08 accepted where 1,076.09 was refused DISCOUNT_TO_HIGH. The client is a placeholder
     * the proposal needs to parse, since nothing is kept.
     */
    async getExactDiscountCap(priced: ProviderQuote): Promise<number | undefined> {
      const ref = await resolver.toExternalListing(priced.listingId);
      const yachtId = toPositiveIntId(ref.externalYachtId, {
        provider: "NauSYS",
        what: "the yacht id",
      });
      const proposal = await client.bookingCall(
        nausysEndpoints.booking.createInfo,
        restProposalSchema,
        {
          client: { name: "Price", surname: "Check", email: "price-check@example.com" },
          periodFrom: formatNausysDate(priced.checkIn),
          periodTo: formatNausysDate(priced.checkOut),
          yachtID: yachtId,
          numberOfGuests: priced.guests,
          proposal: true,
        },
      );
      const currency = proposal.currency ?? proposal.paymentCurrency;
      const net = proposal.effectiveAgencyCommissionAmountWithoutVAT;
      if (currency !== priced.currency || net === undefined || proposal.clientPrice === undefined) {
        return undefined;
      }
      return maxClientDiscountOf(
        await options.loadDiscountRule?.(priced.listingId),
        decimalStringToMinor(net, currency),
        decimalStringToMinor(proposal.clientPrice, currency),
      );
    },
    async getNausysQuote(input: QuoteRequest): Promise<ProviderQuote> {
      return mapFreeYachtToProviderQuote(await mappingFor(input));
    },
    async getNausysQuoteWithRows(input: QuoteRequest) {
      const mapping = await mappingFor(input);
      return { quote: mapFreeYachtToProviderQuote(mapping), billedRows: billedExtraRows(mapping) };
    },
  };
}

/**
 * The row to price when the vendor answers one yacht more than once.
 *
 * A free-yacht row is a yacht, a period and a pair of locations: the same hull can come back as
 * a round trip and as a one-way, at different prices. The first row was taken, so a customer
 * could be quoted the one-way without being told they would finish elsewhere. A round trip is
 * what we sell unless nothing else is on offer.
 */
export function preferredFreeYachtRow<T extends { locationFromId?: number; locationToId?: number }>(
  rows: readonly T[],
): T | undefined {
  return rows.find(isRoundTrip) ?? rows[0];
}

function isRoundTrip(row: { locationFromId?: number; locationToId?: number }): boolean {
  return (
    row.locationFromId === undefined ||
    row.locationToId === undefined ||
    row.locationFromId === row.locationToId
  );
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
  /** Every crew role's service id, aboard or not, so none is ever billed as an add-on. */
  crewRoleServiceIds?: readonly string[] | undefined;
  securityDeposit?: Money | undefined;
  expiresAt: string;
  labelFor?: ((kind: NausysLabelKind, externalId: string) => string | undefined) | undefined;
  /** Marina names by location id; see `loadLocationNames`. */
  locationNames?: ReadonlyMap<string, string> | undefined;
  /** The operator's bound on our client discount; see `DiscountRule`. */
  discountRule?: DiscountRule | undefined;
}

/** Pure `RestFreeYacht → ProviderQuote`. No I/O, no clock, no vendor field beyond this file. */
export function mapFreeYachtToProviderQuote(input: FreeYachtMapping): ProviderQuote {
  const { yacht } = input;

  assertEchoedPeriod(yacht, input.checkIn, input.checkOut);

  const currency = yacht.price.currency;
  const listPriceMinor = decimalStringToMinor(yacht.price.priceListPrice, currency);
  const clientPriceMinor = decimalStringToMinor(yacht.price.clientPrice, currency);

  /* What a percentage extra is a percentage of; see `PercentageBasis`. */
  const basis = { listMinor: listPriceMinor, clientMinor: clientPriceMinor };

  const charterLines = buildCharterLines(yacht, currency, listPriceMinor, clientPriceMinor, input);
  const obligatory = yacht.obligatoryExtras ?? [];
  const additional = yacht.additionalExtras ?? [];
  const obligatoryCodes = rowCodes(obligatory);
  const additionalCodes = rowCodes(additional);
  const obligatoryLines = obligatory.map((extra, index) =>
    toExtraLine(
      extra,
      obligatoryCodes[index] ?? offerExtraCode(extra),
      currency,
      input,
      "mandatory",
      basis,
    ),
  );
  const { crew, selected } = billedAdditionalRows(input, basis);
  const crewLines = crew.map((row) =>
    toExtraLine(row.extra, row.code, currency, input, "crew", basis),
  );
  const selectedLines = selected.map((row) =>
    toExtraLine(row.extra, row.code, currency, input, "optional", basis),
  );
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

  const offeredExtras = offeredExtrasOf(
    additional,
    additionalCodes,
    obligatoryCodesOf(yacht),
    currency,
    basis,
  );

  const paymentPolicy = toPaymentPolicy(yacht.paymentPlans, yacht.yachtId);
  const payableNowMinor = sumMinor(lines.filter((line) => line.payWhen === "now"));
  const depositMinor =
    paymentPolicy.mode === "full"
      ? payableNowMinor
      : Math.round(payableNowMinor * paymentPolicy.depositPct);

  // Crew as well as the ticked extras: both are billed, so a move in either has to
  // invalidate the quote before checkout takes money against it.
  const priceSourceHash = priceObservationHash(yacht, input.securityDeposit, [
    ...crew.map((row) => row.extra),
    ...selected.map((row) => row.extra),
  ]);

  const commission = commissionOf(yacht.price, currency, clientPriceMinor);
  const maxClientDiscount = maxClientDiscountOf(
    input.discountRule,
    commission?.amount.amountMinor,
    clientPriceMinor,
  );

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
    ...(commission === undefined ? null : { commission }),
    ...(maxClientDiscount === undefined
      ? null
      : { maxClientDiscount: { amountMinor: maxClientDiscount, currency } }),
    priceSourceHash,
    // `QuoteRequest` carries no expected price, so the adapter has nothing to
    // compare against; `repriceQuote` sets this itself when the caller asked for
    // a reprice.
    repriced: false,
    expiresAt: input.expiresAt,
    checkInTime: wallClockTime(yacht.checkIn),
    checkOutTime: wallClockTime(yacht.checkOut),
    ...routeOf(yacht, input.locationNames, totalMinor, currency),
  });
}

/**
 * Where the charter starts and ends, in the operator's locations.
 *
 * One entry, never a choice: NauSYS fixes a one-way through the yacht's `oneWayPeriods`, and
 * `createInfo` takes no base or location, so there is nothing a customer could pick that the
 * reservation would honour. What they must be told is that it ends somewhere else, which a
 * charter priced from a one-way row used to leave unsaid. Ids are NauSYS location ids, a space
 * the booking never sends back.
 */
function routeOf(
  yacht: RestFreeYacht,
  names: ReadonlyMap<string, string> | undefined,
  totalMinor: number,
  currency: string,
): Pick<ProviderQuote, "route" | "routeOptions"> | null {
  if (yacht.locationFromId === undefined || yacht.locationToId === undefined) return null;
  const startBaseId = String(yacht.locationFromId);
  const endBaseId = String(yacht.locationToId);
  const startBaseName = names?.get(startBaseId);
  const endBaseName = names?.get(endBaseId);

  return {
    route: { startBaseId, endBaseId },
    routeOptions: [
      {
        startBaseId,
        endBaseId,
        ...(startBaseName === undefined ? null : { startBaseName }),
        ...(endBaseName === undefined ? null : { endBaseName }),
        isOneWay: startBaseId !== endBaseId,
        total: { amountMinor: totalMinor, currency },
      },
    ],
  };
}

/** What a `createInfo` proposal says about the money; see `getExactDiscountCap`. */
const restProposalSchema = looseJsonObject({
  status: z.string(),
  clientPrice: z.string().optional(),
  currency: z.string().optional(),
  paymentCurrency: z.string().optional(),
  effectiveAgencyCommissionAmountWithoutVAT: z.string().optional(),
});

/**
 * How much of the price we may give away, in minor units, or undefined for no bound.
 *
 * Never more than the commission itself, whatever the rule says: past it we would sell below
 * what we pay the operator. A rule stated against a commission the offer did not report allows
 * nothing, since there is no share of it we can prove we have.
 */
function maxClientDiscountOf(
  rule: DiscountRule | undefined,
  commissionMinor: number | undefined,
  clientPriceMinor: number,
): number | undefined {
  if (rule === undefined) return commissionMinor;
  const fraction = Math.min(Math.max(rule.fraction, 0), 1);
  const byRule =
    rule.basis === "CLIENT_PRICE"
      ? Math.floor(clientPriceMinor * fraction)
      : commissionMinor === undefined
        ? 0
        : Math.floor(commissionMinor * fraction);
  return commissionMinor === undefined ? byRule : Math.min(byRule, commissionMinor);
}

/**
 * Our share of this charter, from `agencyCommission`.
 *
 * NauSYS states the money and not the rate, so the rate is derived against `clientPrice`,
 * which is the price the commission arrives inside. Undefined where the vendor says nothing:
 * silence is not a statement that we earn nothing, and the hand-typed agreement is the
 * fallback for that case.
 */
function commissionOf(
  price: { agencyCommission?: string },
  currency: string,
  clientPriceMinor: number,
): ProviderQuoteCommission | undefined {
  if (price.agencyCommission == null) return undefined;

  let amountMinor: number;
  try {
    amountMinor = decimalStringToMinor(price.agencyCommission, currency);
  } catch {
    return undefined;
  }
  if (amountMinor < 0) return undefined;

  const commission: ProviderQuoteCommission = { amount: { amountMinor, currency } };
  /* Four decimals, matching the column, so 1,120.00 of 5,600.00 reads as 20 and not 19.9999. */
  const pct =
    clientPriceMinor > 0 ? Math.round((amountMinor / clientPriceMinor) * 1e6) / 1e4 : null;
  if (pct !== null && pct >= 0 && pct <= 100) commission.pct = pct;
  return commission;
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
  const { steps, netMinor } = walkDiscounts(yacht.price.discounts ?? [], listPriceMinor, currency);
  if (steps.length === 0 || netMinor !== clientPriceMinor) {
    return [baseLine(clientPriceMinor, currency)];
  }

  const discountLines = steps.map(
    ({ discount, amountMinor }): QuoteLine => ({
      code: `nausys-discount-${discount.discountItemId}`,
      label: labelOf(input, "discount", String(discount.discountItemId), DEFAULT_LABELS.discount),
      amount: { amountMinor: -amountMinor, currency },
      payWhen: "now",
      kind: "discount",
    }),
  );

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

/**
 * The services the offer already bills as obligatory.
 *
 * An operator can list the same service in both lists: a damage waiver obligatory at 420 and
 * optional at 350 "when skipper is chosen", a free car park beside "additional car 45/week".
 * The obligatory line is charged on every charter, so selling the add-on as well billed the
 * waiver twice; and a skipper obligatory on a crewed yacht was billed a second time by the
 * crew control. The add-on is never sold on top of it.
 */
function obligatoryCodesOf(yacht: RestFreeYacht): Set<string> {
  return new Set((yacht.obligatoryExtras ?? []).map((extra) => offerExtraCode(extra)));
}

/** One additional-extras row with the code the rest of the system knows it by. */
interface AdditionalRow {
  extra: RestExtra;
  code: string;
}

interface BilledAdditionalRows {
  crew: AdditionalRow[];
  selected: AdditionalRow[];
}

/**
 * The additional rows this charter bills: the crew its crew type puts aboard and the extras
 * the customer ticked. Shared by the quote and the hold, so what `addExtras` puts on the
 * reservation is exactly what the customer was quoted.
 */
function billedAdditionalRows(
  input: FreeYachtMapping,
  basis: PercentageBasis,
): BilledAdditionalRows {
  const additional = input.yacht.additionalExtras ?? [];
  const codes = rowCodes(additional);
  const obligatory = obligatoryCodesOf(input.yacht);
  const rows = additional
    .map((extra, index) => ({ extra, code: codes[index] ?? offerExtraCode(extra) }))
    .filter((row) => !obligatory.has(offerExtraCode(row.extra)));

  /*
   * Crew is bought by choosing a crew type, not by ticking an extra, so it is
   * excluded from the optional selection: billing the same service twice is what
   * would happen if a customer ticked the skipper the crew control already added.
   */
  const crewCodes = new Set(
    (input.crewServiceIds ?? []).map((id) => formatExtraCode("service", id)),
  );
  /*
   * Every crew role the listing knows, aboard or not. A variant the customer picked for a role
   * is carried in `extras` like any other code, and must never fall through to the optional
   * selection: switching from full crew to a skipper would otherwise have kept billing the
   * hostess they had picked, as an add-on.
   */
  const roleCodes = new Set([
    ...crewCodes,
    ...(input.crewRoleServiceIds ?? []).map((id) => formatExtraCode("service", id)),
  ]);
  const crewPicks = new Set(
    (input.extras ?? []).filter((code) => crewCodes.has(baseExtraCode(code))),
  );
  const crew = crewRowsFor(
    rows.filter((row) => crewCodes.has(offerExtraCode(row.extra))),
    crewPicks,
    input.guests,
    input.yacht.price.currency,
    basis,
  );
  const wanted = new Set(
    (input.extras ?? []).filter((code) => !roleCodes.has(baseExtraCode(code))),
  );
  /*
   * A selection names one row: the plain code for an extra the offer sells once, a variant code
   * for one it sells as alternatives. The plain code of a many-row extra matches nothing, so a
   * transfer ticked without a route prices nothing rather than every route at once.
   */
  const selected = rows.filter((row) => wanted.has(row.code));
  return { crew, selected };
}

/** A billed row as `addExtras` addresses it: the season price row's id, per id space. */
export interface BilledExtraRow {
  kind: ExtraKind;
  rowId: number;
  code: string;
  /** The catalogue id, which is all a reservation line names of where it came from. */
  externalId: string;
  /** The row's condition, which tells one variant's reservation line from another's. */
  condition: string | null;
}

/**
 * The rows `addExtras` has to put on the reservation for this charter to be the one quoted.
 *
 * A row without a usable id cannot be addressed, and dropping it would hold a reservation that
 * silently lacks something the customer paid for, so it throws instead.
 */
export function billedExtraRows(input: FreeYachtMapping): BilledExtraRow[] {
  const currency = input.yacht.price.currency;
  const basis = {
    listMinor: decimalStringToMinor(input.yacht.price.priceListPrice, currency),
    clientMinor: decimalStringToMinor(input.yacht.price.clientPrice, currency),
  };
  const { crew, selected } = billedAdditionalRows(input, basis);

  return [...crew, ...selected].map((row) => {
    const rowId = row.extra.id;
    if (rowId === undefined || !Number.isSafeInteger(rowId)) {
      throw new ContractError(
        `NauSYS offer row for ${row.code} carries no id addExtras can address`,
        { endpoint: nausysEndpoints.availability.freeYachts },
      );
    }
    const identity = offerExtraIdentity(row.extra);
    return {
      kind: identity.kind,
      rowId,
      code: row.code,
      externalId: identity.externalId,
      condition: conditionText(row.extra),
    };
  });
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

/**
 * Each entry's code, index for index: the plain code where the offer lists the extra once, a
 * variant code where it lists it several times. Counted per list, because an obligatory row and
 * an additional one of the same service are different charges, not alternatives.
 *
 * A repeated row the vendor sent without a usable id keeps the plain code, as every row did
 * before variants were told apart: there is nothing else to address it by. Obligatory rows
 * arrive with 64-bit ids a number cannot hold exactly, so they land here too.
 */
function rowCodes(extras: readonly RestExtra[]): string[] {
  const rows = new Map<string, number>();
  for (const extra of extras) {
    const code = offerExtraCode(extra);
    rows.set(code, (rows.get(code) ?? 0) + 1);
  }

  return extras.map((extra) => {
    const code = offerExtraCode(extra);
    if ((rows.get(code) ?? 0) < 2 || !Number.isSafeInteger(extra.id)) return code;
    const { kind, externalId } = offerExtraIdentity(extra);
    return formatExtraVariantCode(kind, externalId, String(extra.id));
  });
}

/**
 * One row per crew role, where the offer sells a role as several.
 *
 * It does: a skipper as a male and a female captain, or by the day and by the week; a hostess
 * for "up to 4 guests" and for "5-8 guests". Every row used to be billed, so a skipper cost
 * 1,400 plus 1,500. The customer's own pick wins. Without one, a row whose stated party size
 * excludes this party goes and the cheapest of the rest is priced, its label saying which one
 * it was, so the sidebar can offer the others.
 */
function crewRowsFor(
  rows: readonly { extra: RestExtra; code: string }[],
  picks: ReadonlySet<string>,
  guests: number,
  currency: string,
  basis: PercentageBasis,
): { extra: RestExtra; code: string }[] {
  const byRole = new Map<string, { extra: RestExtra; code: string }[]>();
  for (const row of rows) {
    const role = baseExtraCode(row.code);
    byRole.set(role, [...(byRole.get(role) ?? []), row]);
  }

  return [...byRole.values()].flatMap((variants) => {
    /* Rows that could not be told apart keep the old behaviour; there is nothing to choose by. */
    if (variants.every((row) => row.code === baseExtraCode(row.code))) return variants;

    const picked = variants.find((row) => picks.has(row.code));
    if (picked) return [picked];

    const fitting = variants.filter((row) => fitsParty(conditionText(row.extra), guests));
    const candidates = fitting.length > 0 ? fitting : variants;
    const priceOf = (row: { extra: RestExtra }) => extraLineMinor(row.extra, currency, basis);
    return [candidates.reduce((low, row) => (priceOf(row) < priceOf(low) ? row : low))];
  });
}

const PEOPLE = String.raw`(?:guests?|pax|persons?|people)`;
const PARTY_RANGE = new RegExp(String.raw`(\d+)\s*-\s*(\d+)\s*${PEOPLE}`, "i");
const PARTY_UP_TO = new RegExp(String.raw`up\s+to\s+(\d+)\s*${PEOPLE}`, "i");

/**
 * Whether a variant's own words leave room for this party. Only the two ways operators have
 * been seen to write it, "up to 4 guests" and "5-8 guests"; a condition that states no party
 * size fits every party.
 */
function fitsParty(condition: string | null, guests: number): boolean {
  if (condition === null) return true;

  const range = PARTY_RANGE.exec(condition);
  if (range) return guests >= Number(range[1]) && guests <= Number(range[2]);

  const upTo = PARTY_UP_TO.exec(condition);
  if (upTo) return guests <= Number(upTo[1]);

  return true;
}

const DETAIL_MAX = 90;

/**
 * How a variant is named beside its extra: the first line of the operator's condition, cut
 * short. Most are a route or a vehicle ("Athens Airport - Lavrion base; taxi 1 - 3 pax"), but
 * some operators write a paragraph, and the whole of it ended up in the line label, the
 * confirmation email and the crew select. The full text still decides the party-size fit.
 */
function variantDetail(extra: RestExtra): string | null {
  const firstLine = conditionText(extra)?.split("\n")[0]?.trim();
  if (!firstLine) return null;
  return firstLine.length <= DETAIL_MAX
    ? firstLine
    : `${firstLine.slice(0, DETAIL_MAX - 1).trimEnd()}…`;
}

/** The operator's condition on an offer row; see `internationalText`. */
function conditionText(extra: RestExtra): string | null {
  return internationalText(extra.condition);
}

/**
 * Everything the offer could price, ticked or not, so the listing can grey out the extras this
 * period does not sell instead of accepting a choice that quietly costs nothing. Crew stays in:
 * the listing keeps crew roles out of its optional extras entirely, so nothing downstream can
 * offer them twice.
 *
 * One entry per extra, with its variants beneath it where the offer sells it as several. The
 * listing used to key this by the plain code, so seven transfer rows collapsed onto whichever
 * came last and the box read 300 while ticking it charged 1,000.
 */
function offeredExtrasOf(
  additional: readonly RestExtra[],
  codes: readonly string[],
  obligatory: ReadonlySet<string>,
  currency: string,
  basis: PercentageBasis,
): NonNullable<ProviderQuote["offeredExtras"]> {
  const byExtra = new Map<string, NonNullable<ProviderQuote["offeredExtras"]>[number]>();

  additional.forEach((extra, index) => {
    const identity = offerExtraIdentity(extra);
    /* An entry we cannot place, or cannot pay for in the charter's currency, is not
       on offer: leaving it out is also what keeps `toExtraLine` from ever meeting it. */
    if (identity.externalId === UNPLACEABLE_ID || extra.currency !== currency) return;
    if (obligatory.has(offerExtraCode(extra))) return;

    const code = codes[index] ?? offerExtraCode(extra);
    const base = baseExtraCode(code);
    const amount = { amountMinor: extraLineMinor(extra, currency, basis), currency };
    const payWhen = payWhenFor(extra);
    const entry = byExtra.get(base);

    if (code === base) {
      const note = conditionText(extra);
      if (entry === undefined) {
        byExtra.set(base, { code: base, amount, payWhen, ...(note === null ? null : { note }) });
      }
      return;
    }

    const variant = { code, detail: variantDetail(extra), amount, payWhen };
    if (entry === undefined) {
      byExtra.set(base, { code: base, amount, payWhen, variants: [variant] });
      return;
    }
    entry.variants = [...(entry.variants ?? []), variant];
    if (amount.amountMinor < entry.amount.amountMinor) entry.amount = amount;
  });

  return [...byExtra.values()];
}

function toExtraLine(
  extra: RestExtra,
  code: string,
  currency: string,
  input: FreeYachtMapping,
  group: NonNullable<QuoteLine["group"]>,
  basis?: PercentageBasis,
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

  const lineMinor = extraLineMinor(extra, currency, basis);
  const label = labelOf(input, identity.kind, identity.externalId, DEFAULT_LABELS.service);
  /* Only a variant needs telling apart; on a single-row extra the condition is fine print. */
  const detail = code === baseExtraCode(code) ? null : variantDetail(extra);
  const note = detail === null ? conditionText(extra) : null;

  return {
    // The canonical extra identity, the same string the listing page rendered and
    // the customer submitted. Keeping the namespaces aligned is what lets a
    // selection be reconciled against the line that priced it, and what makes
    // `booking_extra.code` mean the same thing as the code on screen.
    code,
    label: detail === null ? label : `${label} (${detail})`,
    ...(detail === null ? null : { detail }),
    ...(note === null ? null : { note }),
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
      /* Which variant: two transfer rows share the service id and differ only here. */
      rowId: Number.isSafeInteger(extra.id) ? (extra.id ?? null) : null,
      // Both, not just whichever we billed. A unit price that moves while the
      // total holds still means the vendor changed something about this line, and
      // a re-quote is cheap next to serving a stale one.
      amount: extra.amount,
      totalPrice: extra.totalPrice ?? null,
      quantity: extra.quantity ?? null,
      currency: extra.currency,
      calculationType: extra.calculationType ?? null,
    }))
    .sort((a, b) => a.serviceId - b.serviceId || (a.rowId ?? 0) - (b.rowId ?? 0));
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
