import { booking } from "@yacht-charter/db/schema/booking";
import { and, eq } from "drizzle-orm";

import type { Database } from "../registry";
import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { formatNausysDate, parseNausysDate, parseNausysDateTime } from "../shared/dates";
import { ContractError } from "../shared/errors";
import { decimalStringToMinor } from "../shared/money";
import { stableSourceHash } from "../shared/raw-retention";
import { recordReservationEvent, type ReservationEventKind } from "../shared/reservation-log";
import {
  bookingDraftSchema,
  providerExtrasMutationSchema,
  providerQuoteSchema,
  providerReservationRefSchema,
  providerReservationSchema,
  type BookingDraft,
  type ProviderExtrasMutation,
  type ProviderQuote,
  type ProviderReservation,
  type ProviderReservationRef,
} from "../types";
import type { NausysClient } from "./client";
import type { NausysConfig } from "./config";
import {
  nausysEndpoints,
  restYachtReservationResponseSchema,
  type RestClient,
  type RestYachtReservation,
} from "./endpoints";

const PROVIDER = "nausys" as const;

/**
 * Re-prices the draft against the provider and returns the price source hash of
 * what is on offer right now. Injected rather than imported so this file stays
 * independent of the quote module, and so the refusal path is testable without a
 * second endpoint in play.
 */
export type VerifyPrice = (draft: BookingDraft) => Promise<string>;

export interface ReservationEventInput {
  /** Our quote id; `booking.quote_id` is what ties an event back to a booking. */
  quoteId: string;
  kind: ReservationEventKind;
  providerReference?: string | null;
  payload?: unknown;
}

export type ReservationEventRecorder = (event: ReservationEventInput) => Promise<void>;

/**
 * Receives every refreshed uuid. `addOrUpdateExtras` returns a `ProviderQuote`,
 * which has nowhere to carry a security token, so without this the rotation on
 * that path would be dropped and every later call on the booking would fail.
 */
export type SecurityTokenSink = (rotation: {
  providerReservationId: string;
  securityToken: string;
}) => Promise<void>;

export interface NausysBookingServiceDeps {
  client: NausysClient;
  resolver: CatalogueResolver;
  config: NausysConfig;
  db: Database;
  verifyPrice: VerifyPrice;
  recordEvent?: ReservationEventRecorder;
  persistSecurityToken?: SecurityTokenSink;
  /**
   * `addExtras` appends, `updateExtras` replaces. Our `extras` array is the full
   * desired set rather than a delta, so replacing is the only retry-safe call and
   * is the default; the append path stays reachable for a vendor account whose
   * update call is refused on a reservation that has no extras yet (Q-COMPLY).
   */
  extrasMode?: "add" | "update";
}

export interface NausysBookingService {
  createOption(draft: BookingDraft): Promise<ProviderReservation>;
  confirmBooking(draft: BookingDraft): Promise<ProviderReservation>;
  cancelOption(ref: ProviderReservationRef): Promise<ProviderReservation>;
  addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote>;
}

/** `{id, uuid}` as the vendor wants them: the uuid is only valid for one call. */
interface ReservationHandle {
  id: number;
  uuid: string;
}

interface ReservationStep {
  response: RestYachtReservation;
  /** The uuid the vendor just issued, never the one we sent. */
  handle: ReservationHandle;
}

/** The one call that has no reservation yet, so nothing to authenticate against. */
const OPENS_RESERVATION = "opens-reservation" as const;

export function createNausysBookingService(deps: NausysBookingServiceDeps): NausysBookingService {
  const { client, resolver, config, db, verifyPrice } = deps;
  const recordEvent = deps.recordEvent ?? createReservationEventRecorder(db);
  const persistSecurityToken = deps.persistSecurityToken ?? createSecurityTokenSink(db);
  const extrasMode = deps.extrasMode ?? "update";

  /**
   * The uuid funnel: the only way this file issues a booking call.
   *
   * NauSYS rotates the per-reservation `uuid` whenever anything important about
   * the reservation changes, and a call carrying a stale one is refused. So the
   * funnel owns both ends of that token. It refuses to call at all without a
   * usable handle, it writes `id` and `uuid` into the body itself rather than
   * trusting each call site to remember, and it hands back the refreshed handle
   * so the caller persists it alongside the state change it just made.
   *
   * The endpoint and body are parameters rather than a callback for that middle
   * reason: a callback that builds its own body can forget the uuid, and a path
   * that mutates a reservation without writing the new uuid back breaks every
   * later call on that booking, with a failure that only surfaces hours later.
   */
  async function withReservation(
    ref: ProviderReservationRef | typeof OPENS_RESERVATION,
    endpoint: string,
    body: Record<string, unknown> = {},
  ): Promise<ReservationStep> {
    const current = ref === OPENS_RESERVATION ? null : requireHandle(ref, endpoint);

    const response = await client.bookingCall(
      endpoint,
      restYachtReservationResponseSchema,
      current ? { ...body, id: current.id, uuid: current.uuid } : body,
    );

    if (current && response.id !== current.id) {
      throw new ContractError(
        `NauSYS ${endpoint} answered for reservation ${response.id}, not ${current.id}`,
        { endpoint, payload: { requested: current.id, returned: response.id } },
      );
    }

    const handle = refreshedHandle(response, endpoint);

    // Deliberately not best-effort: a rotation we failed to store leaves the
    // reservation unreachable, so failing at the call that rotated it is the
    // earliest and loudest place to find out.
    if (current) {
      await persistSecurityToken({
        providerReservationId: String(handle.id),
        securityToken: handle.uuid,
      });
    }

    return { response, handle };
  }

  /**
   * Our single hold collapses the vendor's first two steps. INFO creates the
   * reservation and blocks nothing; OPTION is what actually takes the yacht off
   * the market and is the only step that returns an expiry.
   */
  async function createOption(draft: BookingDraft): Promise<ProviderReservation> {
    const parsed = bookingDraftSchema.parse(draft);

    // Before anything is created: `freeYachts` leaves no provider-side artifact,
    // so this hash is the only link between the price the customer accepted and
    // the reservation about to be opened.
    const current = await verifyPrice(parsed);
    if (current !== parsed.priceSourceHash) {
      throw new ContractError(
        "PRICE_CHANGED: the NauSYS price moved between the quote and the hold",
        {
          endpoint: nausysEndpoints.booking.createInfo,
          providerCode: "PRICE_CHANGED",
          payload: { expected: parsed.priceSourceHash, actual: current },
        },
      );
    }

    const yachtId = await externalYachtId(parsed.listingId);

    const info = await withReservation(OPENS_RESERVATION, nausysEndpoints.booking.createInfo, {
      client: toRestClient(parsed.customer),
      periodFrom: formatNausysDate(parsed.checkIn),
      periodTo: formatNausysDate(parsed.checkOut),
      yachtID: yachtId,
    });

    // A failure after this point leaves an INFO record behind. It holds no yacht,
    // so it is logged and left alone: a compensating storno would be a second
    // provider call on an object that costs nothing to abandon.
    await logEvent(parsed.quoteId, "info_created", info);

    const option = await withReservation(refOf(info.handle), nausysEndpoints.booking.createOption, {
      createWaitingOption: false,
    });

    await logEvent(parsed.quoteId, "option_created", option);

    const reservationId = String(option.handle.id);

    return providerReservationSchema.parse({
      id: reservationId,
      provider: PROVIDER,
      listingId: parsed.listingId,
      quoteId: parsed.quoteId,
      status: toCanonicalStatus(option.response.reservationStatus),
      // NauSYS carries one numeric id through the whole chain, so the option and
      // the reservation are the same handle.
      providerReservationId: reservationId,
      providerOptionId: reservationId,
      securityToken: option.handle.uuid,
      holdExpiresAt: holdExpiresAt(option.response),
    });
  }

  async function confirmBooking(draft: BookingDraft): Promise<ProviderReservation> {
    const parsed = bookingDraftSchema.parse(draft);

    if (!parsed.reservation) {
      throw new ContractError(
        "NauSYS createBooking needs the reservation the option step opened; the draft carries none",
        { endpoint: nausysEndpoints.booking.createBooking },
      );
    }

    const step = await withReservation(parsed.reservation, nausysEndpoints.booking.createBooking);

    await logEvent(parsed.quoteId, "confirm_succeeded", step);

    const reservationId = String(step.handle.id);

    return providerReservationSchema.parse({
      id: reservationId,
      provider: PROVIDER,
      listingId: parsed.listingId,
      quoteId: parsed.quoteId,
      status: toCanonicalStatus(step.response.reservationStatus),
      providerReservationId: reservationId,
      providerOptionId: parsed.reservation.providerOptionId ?? reservationId,
      securityToken: step.handle.uuid,
    });
  }

  async function cancelOption(ref: ProviderReservationRef): Promise<ProviderReservation> {
    const parsed = providerReservationRefSchema.parse(ref);
    const step = await withReservation(parsed, nausysEndpoints.booking.stornoOption);

    return providerReservationSchema.parse({
      id: String(step.handle.id),
      provider: PROVIDER,
      // The storno response links back to the yacht but not to our quote; the
      // caller already holds both and only reads the status and the token here.
      listingId: (await resolver.toListingId(String(step.response.yachtId))) ?? "",
      quoteId: "",
      status: toCanonicalStatus(step.response.reservationStatus),
      providerReservationId: String(step.handle.id),
      securityToken: step.handle.uuid,
    });
  }

  async function addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote> {
    const parsed = providerExtrasMutationSchema.parse(input);
    const serviceIds = await externalServiceIds(parsed.extras);

    const endpoint =
      extrasMode === "add"
        ? nausysEndpoints.booking.addExtras
        : nausysEndpoints.booking.updateExtras;

    const step = await withReservation(parsed.ref, endpoint, {
      services: serviceIds.map((serviceId) => ({ serviceId, quantity: 1 })),
    });

    await logEventForReservation(parsed.ref.providerReservationId, "extras_updated", step);

    // The mutation answers with the whole reservation, so its price is the
    // re-read: there is no separate booking-side read endpoint.
    return await toProviderQuote(step.response);
  }

  async function externalYachtId(listingId: string): Promise<number> {
    const ref = await resolver.toExternalListing(listingId);
    const yachtId = Number(ref.externalYachtId);
    if (!Number.isInteger(yachtId)) {
      throw new ContractError(
        `Listing ${listingId} maps to a non-numeric NauSYS yacht id: ${JSON.stringify(ref.externalYachtId)}`,
      );
    }
    return yachtId;
  }

  async function externalServiceIds(amenityCodes: string[]): Promise<number[]> {
    const ids = await resolver.toExternalAmenityIds(amenityCodes);
    return ids.map((id) => {
      const numeric = Number(id);
      if (!Number.isInteger(numeric)) {
        throw new ContractError(`Amenity maps to a non-numeric NauSYS service id: ${id}`);
      }
      return numeric;
    });
  }

  function holdExpiresAt(response: RestYachtReservation): string {
    if (!response.optionTill) {
      // Without the vendor's own expiry we cannot know when it drops the option,
      // and a hold nothing ever releases would keep the slot unsellable. Loud
      // here beats silently holding phantom inventory.
      throw new ContractError("NauSYS createOption returned no optionTill", {
        endpoint: nausysEndpoints.booking.createOption,
      });
    }

    const till = parseNausysDateTime(response.optionTill, config.optionTimeZone);
    // We must release first: expiring after the provider has already dropped the
    // option means selling a slot that is no longer ours.
    return new Date(till.getTime() - config.optionSafetyMarginMinutes * 60_000).toISOString();
  }

  async function toProviderQuote(response: RestYachtReservation): Promise<ProviderQuote> {
    const currency = response.currency ?? response.paymentCurrency;
    if (!currency || !response.clientPrice) {
      throw new ContractError("NauSYS extras mutation returned no priced reservation", {
        endpoint: nausysEndpoints.booking.updateExtras,
        payload: { id: response.id },
      });
    }

    const checkIn = parseNausysDate(response.periodFrom);
    const checkOut = parseNausysDate(response.periodTo);
    const baseMinor = decimalStringToMinor(response.clientPrice, currency);

    const extraLines = [...(response.services ?? []), ...(response.additionalEquipment ?? [])].map(
      (extra) => ({
        // The reservation carries service ids without names; labels live in the
        // catalogue, which the quote path owns.
        code: `${PROVIDER}:${extra.serviceId}`,
        label: `Service ${extra.serviceId}`,
        amount: { amountMinor: decimalStringToMinor(extra.amount, currency), currency },
        payWhen: extra.calculationType === "SEPARATE_PAYMENT" ? "at_check_in" : "now",
        kind: "extra" as const,
      }),
    );

    const totalMinor = extraLines.reduce((sum, line) => sum + line.amount.amountMinor, baseMinor);
    const policy = paymentPolicyOf(response);

    return providerQuoteSchema.parse({
      id: `qte_${PROVIDER}_${response.id}`,
      provider: PROVIDER,
      listingId: (await resolver.toListingId(String(response.yachtId))) ?? "",
      providerSourceId: `${PROVIDER}:${response.yachtId}`,
      checkIn,
      checkOut,
      // The reservation carries no crew count; the booking that owns it does.
      guests: 0,
      currency,
      lines: [
        {
          code: "base-charter",
          label: "Charter price",
          amount: { amountMinor: baseMinor, currency },
          kind: "base",
        },
        ...extraLines,
      ],
      total: { amountMinor: totalMinor, currency },
      deposit: {
        amountMinor:
          policy.mode === "full" ? totalMinor : Math.round(totalMinor * policy.depositPct),
        currency,
      },
      ...(response.securityDeposit
        ? {
            securityDeposit: {
              amountMinor: decimalStringToMinor(response.securityDeposit, currency),
              currency,
            },
          }
        : {}),
      paymentPolicy: policy,
      // Deliberately not hashing the whole response: the uuid rotates on every
      // mutation and would make an unchanged price look like a new one.
      priceSourceHash: stableSourceHash({
        clientPrice: response.clientPrice,
        currency,
        securityDeposit: response.securityDeposit,
        discounts: response.discounts,
        services: response.services,
        additionalEquipment: response.additionalEquipment,
      }),
      expiresAt: response.optionTill
        ? holdExpiresAt(response)
        : // A committed reservation's price stands to the charter itself.
          `${checkIn}T00:00:00.000Z`,
      repriced: true,
    });
  }

  async function logEvent(
    quoteId: string,
    kind: ReservationEventKind,
    step: ReservationStep,
  ): Promise<void> {
    await recordEvent({
      quoteId,
      kind,
      providerReference: String(step.handle.id),
      payload: eventPayload(step),
    });
  }

  /**
   * The extras path knows the reservation but not the quote, so the booking is
   * found the other way round. Kept separate rather than widening the recorder:
   * the quote lookup is the common case and the cheaper one.
   */
  async function logEventForReservation(
    providerReservationId: string,
    kind: ReservationEventKind,
    step: ReservationStep,
  ): Promise<void> {
    const quoteId = await quoteIdForReservation(db, providerReservationId);
    if (!quoteId) return;
    await logEvent(quoteId, kind, step);
  }

  return { createOption, confirmBooking, cancelOption, addOrUpdateExtras };
}

/* ------------------------------------------------------------------ internals */

function refOf(handle: ReservationHandle): ProviderReservationRef {
  return { providerReservationId: String(handle.id), securityToken: handle.uuid };
}

/**
 * Refuses before the vendor is touched. Both halves are named separately because
 * they fail for different reasons: a missing id means the option step never ran,
 * a missing uuid means a caller dropped the token it was handed.
 */
function requireHandle(ref: ProviderReservationRef, endpoint: string): ReservationHandle {
  const id = Number(ref.providerReservationId);
  if (!ref.providerReservationId || !Number.isInteger(id)) {
    throw new ContractError(
      `NauSYS ${endpoint} needs a numeric reservation id, received ${JSON.stringify(ref.providerReservationId)}`,
      { endpoint },
    );
  }
  if (!ref.securityToken) {
    throw new ContractError(
      `NauSYS ${endpoint} needs the rotating uuid of reservation ${ref.providerReservationId}; none was persisted`,
      { endpoint },
    );
  }
  return { id, uuid: ref.securityToken };
}

function refreshedHandle(response: RestYachtReservation, endpoint: string): ReservationHandle {
  if (!response.uuid) {
    throw new ContractError(`NauSYS ${endpoint} returned no uuid`, {
      endpoint,
      payload: { id: response.id },
    });
  }
  return { id: response.id, uuid: response.uuid };
}

function toCanonicalStatus(status: RestYachtReservation["reservationStatus"]) {
  switch (status) {
    case "RESERVATION":
      return "confirmed";
    case "STORNO":
      return "cancelled";
    default:
      return "option_held";
  }
}

/**
 * `agencyPrice` is our cost, not the customer's, and `client` is PII under §10.
 * The event log is queried freely, so neither is written to it.
 */
function eventPayload(step: ReservationStep): Record<string, unknown> {
  const { response } = step;
  return {
    id: response.id,
    reservationStatus: response.reservationStatus,
    yachtId: response.yachtId,
    periodFrom: response.periodFrom,
    periodTo: response.periodTo,
    optionTill: response.optionTill,
    clientPrice: response.clientPrice,
    currency: response.currency,
  };
}

/**
 * NauSYS wants a given name and a family name; checkout collects one field. An
 * empty surname is answered with INSUFFICIENT_DATA (201) at the till, so a
 * single-token name is sent in both places rather than half-empty.
 */
export function splitCustomerName(
  name: string,
  surname?: string,
): { name: string; surname: string } {
  const given = name.trim();
  if (surname?.trim()) {
    return { name: given, surname: surname.trim() };
  }

  const parts = given.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    const single = parts[0] ?? "";
    return { name: single, surname: single };
  }
  return { name: parts.slice(0, -1).join(" "), surname: parts.at(-1) ?? "" };
}

function toRestClient(customer: BookingDraft["customer"]): RestClient {
  const { name, surname } = splitCustomerName(customer.name, customer.surname);
  // `countryId` is a NauSYS id, not an ISO code, and nothing resolves one yet;
  // sending our two-letter code back would return INVALID_COUNTRY_ID (401).
  const countryId = Number(customer.countryCode);

  return {
    name,
    surname,
    email: customer.email,
    ...(customer.phone ? { phone: customer.phone, mobile: customer.phone } : {}),
    ...(customer.address ? { address: customer.address } : {}),
    ...(customer.zip ? { zip: customer.zip } : {}),
    ...(customer.city ? { city: customer.city } : {}),
    ...(Number.isInteger(countryId) ? { countryId } : {}),
  };
}

/**
 * The instalment plan lives in `paymentPlans`, which this response does not
 * carry, so an equal split over `numberOfPayments` is the closest honest
 * reading. It is advisory: §6.3 has the listing's own policy override it.
 */
function paymentPolicyOf(response: RestYachtReservation): {
  mode: "deposit" | "full";
  depositPct: number;
} {
  const payments = response.numberOfPayments ?? 1;
  if (payments <= 1) {
    return { mode: "full", depositPct: 1 };
  }
  return { mode: "deposit", depositPct: 1 / payments };
}

async function quoteIdForReservation(
  db: Database,
  providerReservationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ quoteId: booking.quoteId })
    .from(booking)
    .where(
      and(eq(booking.provider, PROVIDER), eq(booking.providerReservationId, providerReservationId)),
    )
    .limit(1);

  return row?.quoteId ?? null;
}

/**
 * `provider_reservation_event` is keyed by booking, and a `BookingDraft` carries
 * the quote instead. For NauSYS `freeYachts` produces no provider quote id, so
 * `draft.quoteId` is always ours and the join is exact.
 */
export function createReservationEventRecorder(db: Database): ReservationEventRecorder {
  return async ({ quoteId, kind, providerReference, payload }) => {
    const [row] = await db
      .select({ id: booking.id })
      .from(booking)
      .where(eq(booking.quoteId, quoteId))
      .limit(1);

    // Reconciliation and admin tooling can drive these calls with no booking
    // behind them; that is not a reason to fail the provider call.
    if (!row) return;

    await recordReservationEvent(db, {
      bookingId: row.id,
      kind,
      provider: PROVIDER,
      providerReference,
      payload,
    });
  };
}

export function createSecurityTokenSink(db: Database): SecurityTokenSink {
  return async ({ providerReservationId, securityToken }) => {
    await db
      .update(booking)
      .set({ providerReservationUuid: securityToken })
      .where(
        and(
          eq(booking.provider, PROVIDER),
          eq(booking.providerReservationId, providerReservationId),
        ),
      );
  };
}
