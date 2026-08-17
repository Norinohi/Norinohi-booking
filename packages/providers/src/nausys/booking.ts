import { booking } from "@yacht-charter/db/schema/booking";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";

import type { JsonObject } from "../shared/json";

import type { Database } from "../registry";
import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { formatNausysDate, parseNausysDate, parseNausysDateTime } from "../shared/dates";
import { ContractError } from "../shared/errors";
import { decimalStringToMinor } from "../shared/money";
import { stableSourceHash } from "../shared/raw-retention";
import {
  createReservationEventRecorder,
  type ReservationEventKind,
  type ReservationEventRecorder,
} from "../shared/reservation-log";
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
import { type NausysClient, reservationLane } from "./client";
import type { NausysConfig } from "./config";
import {
  crewListLinkOf,
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
   * Reads the reservation's current extras so a desired set can be diffed against
   * them. Supplied by the caller because there is no single-reservation read
   * endpoint: the only source is the response of the last mutation, which the
   * booking flow already persists.
   */
  loadReservationExtras?: (ref: ProviderReservationRef) => Promise<ReservationExtra[]>;
}

/** One extra already on the reservation, as the vendor's own response describes it. */
export interface ReservationExtra {
  /** The reservation line id, which is what `updateExtras` addresses. */
  yachtReservationServiceId: number;
  /** The catalogue service the line was created from. */
  serviceId: number;
  quantity: number;
  /** False when the operator has locked the line; we cannot change it. */
  editable: boolean;
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
  const recordEvent = deps.recordEvent ?? createReservationEventRecorder(db, PROVIDER);
  const persistSecurityToken = deps.persistSecurityToken ?? createSecurityTokenSink(db);

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
    body: JsonObject = {},
  ): Promise<ReservationStep> {
    const current = ref === OPENS_RESERVATION ? null : requireHandle(ref, endpoint);

    const response = await client.bookingCall(
      endpoint,
      restYachtReservationResponseSchema,
      current ? { ...body, id: current.id, uuid: current.uuid } : body,
      // Per reservation, because the token this funnel exists to manage is per
      // reservation: two calls in flight on one of them would both carry the uuid
      // that only the first of them is still allowed to use. A call that opens a
      // reservation has none yet and needs no lane.
      current ? reservationLane(String(current.id)) : undefined,
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
    const countryId = await externalCountryId(parsed.customer.countryCode);

    const info = await withReservation(OPENS_RESERVATION, nausysEndpoints.booking.createInfo, {
      client: toRestClient(parsed.customer, countryId),
      periodFrom: formatNausysDate(parsed.checkIn),
      periodTo: formatNausysDate(parsed.checkOut),
      yachtID: yachtId,
    });

    // A failure after this point leaves an INFO record behind. It holds no yacht,
    // so it is logged and left alone: a compensating storno would be a second
    // provider call on an object that costs nothing to abandon.
    await logEvent(parsed.quoteId, "info_created", info);

    /*
     * `createWaitingOption` is a STRING on the vendor's side, not a boolean. A JSON `false`
     * crashes their JSON-B deserializer before any handler runs — Payara answers HTTP 500 with
     * an HTML error page whose root cause is `JsonParser#getString() ... current parser state
     * is VALUE_FALSE`. Verified against the live API: `"false"` returns a normal OPTION.
     */
    const option = await withReservation(refOf(info.handle), nausysEndpoints.booking.createOption, {
      createWaitingOption: "false",
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
      crewListLink: crewListLinkOf(option.response),
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
      // The confirmed reservation is the one whose crew list the base will ask for,
      // so this is the response the link actually matters on.
      crewListLink: crewListLinkOf(step.response),
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

  /**
   * Reconciles the reservation's extras with the set the customer chose.
   *
   * NauSYS confirmed (Aug 2026) that `updateExtras` is a PARTIAL update: "only
   * extra id that you send in the request will be updated, others will remain the
   * same". Sending the desired set therefore does not remove anything, which is
   * how a deselected extra would have stayed on the booking and kept being billed.
   *
   * So the set is diffed instead. Additions go through `addExtras` keyed by
   * catalogue `serviceId`; removals go through `updateExtras` keyed by the
   * reservation line's own `yachtReservationServiceId`, which is the id semantic
   * the vendor confirmed for each call.
   *
   * Removal has no endpoint of its own: NauSYS confirmed (Aug 2026) that setting a
   * line's `quantity` to 0 through `updateExtras` drops it from the info and the
   * option. Two limits ride with that answer. A line the operator locked
   * (`editable: false`) cannot be touched, so a removal it blocks fails here rather
   * than silently keeping a deselected extra on the bill. And extras cannot be
   * edited at all once the booking is confirmed — that one is the vendor's to
   * refuse, since only they know the reservation's current status, and it arrives
   * as a classified provider error.
   */
  async function addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote> {
    const parsed = providerExtrasMutationSchema.parse(input);
    const desired = new Set(await externalServiceIds(parsed.extras));
    const current = (await deps.loadReservationExtras?.(parsed.ref)) ?? [];

    const currentByService = new Map(current.map((item) => [item.serviceId, item]));
    const removals = current.filter((item) => !desired.has(item.serviceId));

    const locked = removals.filter((item) => !item.editable);
    if (locked.length > 0) {
      throw new ContractError(
        `NauSYS reservation ${parsed.ref.providerReservationId} has extras the operator locked, ` +
          `so ${locked.map((item) => item.serviceId).join(", ")} cannot be removed`,
        { payload: { locked: locked.map((item) => item.yachtReservationServiceId) } },
      );
    }

    const additions = [...desired].filter((serviceId) => !currentByService.has(serviceId));

    // Removals first: they only ever shrink the reservation, so a later addition
    // that the vendor refuses leaves the customer holding less than they picked
    // rather than being billed for something they deselected.
    let last =
      removals.length === 0
        ? null
        : await withReservation(parsed.ref, nausysEndpoints.booking.updateExtras, {
            services: removals.map((item) => ({
              yachtReservationServiceId: item.yachtReservationServiceId,
              quantity: 0,
            })),
          });

    if (additions.length > 0) {
      last = await withReservation(parsed.ref, nausysEndpoints.booking.addExtras, {
        services: additions.map((serviceId) => ({ serviceId, quantity: 1 })),
      });
    }

    // Nothing changed, so nothing is mutated: the price still has to come back,
    // and re-sending the current lines at their current quantity is the only
    // read the booking side offers.
    if (last === null) {
      const unchanged = await withReservation(parsed.ref, nausysEndpoints.booking.updateExtras, {
        services: current.map((item) => ({
          yachtReservationServiceId: item.yachtReservationServiceId,
          quantity: item.quantity,
        })),
      });
      return await toProviderQuote(unchanged.response);
    }

    await logEventForReservation(parsed.ref.providerReservationId, "extras_updated", last);

    // The mutation answers with the whole reservation, so its price is the
    // re-read: there is no separate booking-side read endpoint.
    return await toProviderQuote(last.response);
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

  /**
   * `countryId` is a NauSYS id, not an ISO code, so checkout's alpha-2 has to go
   * through the catalogue. An unresolvable code is fatal on purpose: sending the
   * reservation without it earns INSUFFICIENT_DATA (201) at the till, and sending
   * a guessed id would file the charter against the wrong country.
   */
  async function externalCountryId(isoCode: string | undefined): Promise<number | undefined> {
    if (!isoCode) return undefined;

    const external = await resolver.toExternalCountryId(isoCode);
    const numeric = Number(external);
    if (external === null || !Number.isInteger(numeric)) {
      throw new ContractError(`No NauSYS country matches the guest country code ${isoCode}`, {
        endpoint: nausysEndpoints.booking.createInfo,
        payload: { countryCode: isoCode, resolved: external },
      });
    }
    return numeric;
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
        payWhen:
          extra.calculationType === "SEPARATE_PAYMENT"
            ? ("at_check_in" as const)
            : ("now" as const),
        kind: "extra" as const,
      }),
    );

    const totalMinor = extraLines.reduce((sum, line) => sum + line.amount.amountMinor, baseMinor);
    const policy = paymentPolicyOf(response);

    const quoteInput: z.input<typeof providerQuoteSchema> = {
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
    };
    if (response.securityDeposit) {
      quoteInput.securityDeposit = {
        amountMinor: decimalStringToMinor(response.securityDeposit, currency),
        currency,
      };
    }

    return providerQuoteSchema.parse(quoteInput);
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
function eventPayload(step: ReservationStep) {
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

export interface CustomerName {
  name: string;
  surname: string;
}

/**
 * NauSYS wants a given name and a family name; checkout collects one field. An
 * empty surname is answered with INSUFFICIENT_DATA (201) at the till, so a
 * single-token name is sent in both places rather than half-empty.
 */
export function splitCustomerName(name: string, surname?: string): CustomerName {
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

function toRestClient(customer: BookingDraft["customer"], countryId?: number): RestClient {
  const { name, surname } = splitCustomerName(customer.name, customer.surname);

  const client: RestClient = { name, surname, email: customer.email };
  if (customer.phone) {
    // NauSYS treats the two as separate contact channels; we only ever have one.
    client.phone = customer.phone;
    client.mobile = customer.phone;
  }
  if (customer.address) client.address = customer.address;
  if (customer.zip) client.zip = customer.zip;
  if (customer.city) client.city = customer.city;
  if (countryId !== undefined) client.countryId = countryId;
  return client;
}

type PaymentPolicy = ProviderQuote["paymentPolicy"];

/**
 * The instalment plan lives in `paymentPlans`, which this response does not
 * carry, so an equal split over `numberOfPayments` is the closest honest
 * reading. It is advisory: §6.3 has the listing's own policy override it.
 */
function paymentPolicyOf(response: RestYachtReservation): PaymentPolicy {
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
