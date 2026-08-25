import { z } from "zod";

import type { Database } from "../registry";
import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { ContractError } from "../shared/errors";
import { exactJsonNumber } from "../shared/exact-json";
import { toExactPositiveIntId } from "../shared/projection-helpers";
import {
  createReservationEventRecorder,
  type ReservationEventKind,
  type ReservationEventRecorder,
} from "../shared/reservation-log";
import {
  bookingDraftSchema,
  providerExtrasMutationSchema,
  providerReservationRefSchema,
  providerReservationSchema,
  type BookingDraft,
  type CrewType,
  type ProviderExtrasMutation,
  type ProviderQuote,
  type ProviderReservation,
  type ProviderReservationRef,
} from "../types";
import type { BookingManagerClient } from "./client";
import type { BookingManagerConfig } from "./config";
import { formatBookingManagerDateTime, parseBookingManagerDateTime } from "./dates";
import {
  BM_RESERVATION_STATUS,
  BM_RESERVATION_STATUS_NAMES,
  bookingManagerEndpoints,
  restReservationSchema,
  type RestReservation,
} from "./endpoints";

const PROVIDER = "booking_manager" as const;

/**
 * DELETE answers with the cancelled reservation on some tenants and with a bare
 * acknowledgement on others, and nothing about the cancellation is read back, so
 * an unrecognized-but-well-formed body is accepted rather than failing a call the
 * vendor already carried out.
 */
const cancelResponseSchema = z.union([restReservationSchema, z.null(), z.looseObject({})]);

/**
 * Re-prices the draft against the provider and returns the price source hash of
 * what is on offer right now. Injected rather than imported so this file stays
 * independent of the quote module, and so the refusal path is testable without a
 * second endpoint in play.
 */
export type VerifyPrice = (draft: BookingDraft) => Promise<string>;

export interface BookingManagerBookingServiceDeps {
  client: BookingManagerClient;
  resolver: CatalogueResolver;
  config: BookingManagerConfig;
  db: Database;
  verifyPrice: VerifyPrice;
  recordEvent?: ReservationEventRecorder;
  /**
   * `BookingDraft` carries no currency, and the vendor prices per currency. This
   * is the account's billing currency; it must match what the quote was read in
   * or the hold prices a different charter.
   */
  currency?: string;
  /** Same per-yacht product catalogue the quote path resolves against. */
  productNameFor?: (crewType: CrewType) => string | undefined;
  /**
   * The vendor's own client record id, when the agency keeps one. Left unset the
   * reservation carries only `clientName` (Q-BM-CLIENT: MMK has not confirmed how
   * a new end client is created through the API).
   */
  clientIdFor?: (draft: BookingDraft) => number | undefined;
  /**
   * Whether the vendor emails the operator and the client on create. Off by
   * default: our hold is provisional and an operator notified of a booking we may
   * release minutes later is worse than no notification.
   */
  sendNotification?: boolean;
}

export interface BookingManagerBookingService {
  createOption(draft: BookingDraft): Promise<ProviderReservation>;
  confirmBooking(draft: BookingDraft): Promise<ProviderReservation>;
  cancelOption(ref: ProviderReservationRef): Promise<ProviderReservation>;
  addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote>;
}

/**
 * The full `PUT /reservations` body. Every field is sent on every write: the
 * endpoint replaces the resource, so an omitted field is a cleared field.
 */
type ReservationBody = {
  dateFrom: string;
  dateTo: string;
  yachtId: RawJSON;
  /**
   * Omitted on create, sent on update. See `reservationBody`.
   */
  status?: number;
  clientName: string;
  passengersOnBoard: number;
  currency: string;
  sendNotification: boolean;
  productName?: string;
  baseFromId?: RawJSON;
  baseToId?: RawJSON;
  clientId?: number;
};

export function createBookingManagerBookingService(
  deps: BookingManagerBookingServiceDeps,
): BookingManagerBookingService {
  const { client, resolver, config, db, verifyPrice } = deps;
  const recordEvent = deps.recordEvent ?? createReservationEventRecorder(db, PROVIDER);
  const currency = deps.currency ?? "EUR";
  const sendNotification = deps.sendNotification ?? false;

  /**
   * The reservation body, built the same way for the create and the update. PUT
   * is read as a replace rather than a patch: the spec documents one reservation
   * resource and no partial-update semantics, so sending only `{status}` risks
   * the vendor clearing the fields we omitted (Q-BM-PUT).
   *
   * `status` is omitted entirely on create. POST can only ever open an option, so
   * the field says nothing the endpoint does not already decide, and the vendor
   * asked us not to send it: "you do not need to specify the status ... I strongly
   * recommend not including the status field" (Diego Pacifico, MMK, 2026-08-25).
   * Only `dateFrom`, `dateTo` and `yachtId` are mandatory there. It stays on the
   * update, which is the call that moves an option to a reservation and the one
   * place the value carries meaning.
   */
  async function reservationBody(draft: BookingDraft, status?: number): Promise<ReservationBody> {
    const ref = await resolver.toExternalListing(draft.listingId);
    const yachtId = toExactPositiveIntId(ref.externalYachtId, {
      provider: "Booking Manager",
      what: `listing ${draft.listingId}`,
    });
    const baseId = ref.externalBaseId?.trim() || undefined;
    const productName = draft.crewType ? deps.productNameFor?.(draft.crewType) : undefined;
    const clientId = deps.clientIdFor?.(draft);

    const body: ReservationBody = {
      // Midnight both ends: the vendor owns the base's turnaround times and
      // substitutes them, exactly as it does on `/offers`.
      dateFrom: formatBookingManagerDateTime(draft.checkIn),
      dateTo: formatBookingManagerDateTime(draft.checkOut),
      // The vendor declares these as `Long`, so they go out unquoted and whole.
      // `JSON.stringify` on a number would re-round the digits we just preserved.
      yachtId: exactJsonNumber(yachtId),
      clientName: fullName(draft.customer),
      passengersOnBoard: draft.guests,
      currency,
      sendNotification,
    };
    if (status !== undefined) body.status = status;
    if (productName) body.productName = productName;
    /*
     * The bases the offer was priced for, falling back to the listing's own only when the quote
     * carries none.
     *
     * The fallback used to be the whole story, and it was wrong whenever the boat was not at
     * home: a hull left at the far end of its run is offered from there, so quoting the week of
     * 26 September 2026 priced a Portumna departure while this sent Carrick, opening a
     * reservation on a pairing the vendor never offered. `route` is exactly what `selectOffer`
     * chose, carried through the stored quote.
     */
    const startBase = draft.route?.startBaseId?.trim() || baseId;
    const endBase = draft.route?.endBaseId?.trim() || startBase;
    if (startBase !== undefined && /^[1-9]\d*$/.test(startBase)) {
      body.baseFromId = exactJsonNumber(startBase);
    }
    if (endBase !== undefined && /^[1-9]\d*$/.test(endBase)) {
      body.baseToId = exactJsonNumber(endBase);
    }
    if (clientId !== undefined) body.clientId = clientId;
    return body;
  }

  async function createOption(draft: BookingDraft): Promise<ProviderReservation> {
    const parsed = bookingDraftSchema.parse(draft);

    // Before anything is created: `/offers` leaves no provider-side artifact, so
    // this hash is the only link between the price the customer accepted and the
    // reservation about to be opened.
    const current = await verifyPrice(parsed);
    if (current !== parsed.priceSourceHash) {
      throw new ContractError(
        "PRICE_CHANGED: the Booking Manager price moved between the quote and the hold",
        {
          endpoint: bookingManagerEndpoints.reservation,
          providerCode: "PRICE_CHANGED",
          payload: { expected: parsed.priceSourceHash, actual: current },
        },
      );
    }

    const response = await client.post(
      bookingManagerEndpoints.reservation,
      restReservationSchema,
      await reservationBody(parsed),
    );

    await logEvent(parsed.quoteId, "option_created", response);

    const reservationId = String(response.id);

    return providerReservationSchema.parse({
      id: reservationId,
      provider: PROVIDER,
      listingId: parsed.listingId,
      quoteId: parsed.quoteId,
      status: toCanonicalStatus(response, bookingManagerEndpoints.reservation),
      // Booking Manager keeps one id across the option and the reservation it
      // becomes, so the option and the booking are the same handle.
      providerReservationId: reservationId,
      providerOptionId: reservationId,
      holdExpiresAt: holdExpiresAt(response),
    });
  }

  async function confirmBooking(draft: BookingDraft): Promise<ProviderReservation> {
    const parsed = bookingDraftSchema.parse(draft);

    if (!parsed.reservation) {
      throw new ContractError(
        "Booking Manager confirm needs the reservation the option step opened; the draft carries none",
        { endpoint: bookingManagerEndpoints.reservation },
      );
    }

    const id = toExactPositiveIntId(parsed.reservation.providerReservationId, {
      provider: "Booking Manager",
      what: "reservation id",
    });
    const endpoint = bookingManagerEndpoints.reservationById(id);

    const response = await client.put(endpoint, restReservationSchema, {
      ...(await reservationBody(parsed, BM_RESERVATION_STATUS.RESERVATION)),
      id,
    });

    // Every reservation exists twice: a charter-side record whose id ends in the
    // charter company's id, and an agency-side twin ending in ours, linked by
    // `charterReservationId`. POST answers with the charter-side record, but PUT
    // and DELETE always answer with the agency-side one - so an equality check
    // against the id we addressed rejected every real confirmation. Measured
    // 2026-08-20: PUT on charter id 8178244520000100225 answered with agency id
    // 8178244250000107113 carrying charterReservationId 8178244520000100225.
    const answeredForUs = response.id === id || (response.charterReservationId ?? null) === id;
    if (!answeredForUs) {
      throw new ContractError(
        `Booking Manager ${endpoint} answered for reservation ${response.id}, not ${id}`,
        {
          endpoint,
          payload: {
            requested: id,
            returned: response.id,
            charterReservationId: response.charterReservationId,
          },
        },
      );
    }

    await logEvent(parsed.quoteId, "confirm_succeeded", response);

    // The charter-side id stays the handle across option and booking; switching to
    // the id PUT happens to answer with would change the key mid-lifecycle.
    const reservationId = String(id);

    return providerReservationSchema.parse({
      id: reservationId,
      provider: PROVIDER,
      listingId: parsed.listingId,
      quoteId: parsed.quoteId,
      status: toCanonicalStatus(response, endpoint),
      providerReservationId: reservationId,
      providerOptionId: parsed.reservation.providerOptionId ?? reservationId,
    });
  }

  /**
   * DELETE releases an OPTION only; the spec says so and the API enforces it with
   * `400 Reservation already confirmed.`. So the current state is read first:
   * silently issuing the call and reporting `cancelled` would tell our own state
   * machine a charter was released while the vendor still holds the customer to it.
   *
   * A confirmed reservation has one documented route, `POST /requests` with
   * `BM_REQUEST_TYPE.RESERVATION_CANCELLATION` (v2.2.0). It is deliberately not
   * called here. It files a message for the operator rather than cancelling
   * anything, returns a bare 200 that says nothing about acceptance, and leaves no
   * trace on the reservation to poll - so a `cancelled` returned from it would be a
   * claim we cannot support. Wiring it up needs the vendor to say who approves,
   * which status an approval lands on, and what it costs the guest; those are
   * open questions in `docs/vendor/booking-manager-reply-2026-08-25.md`.
   */
  async function cancelOption(ref: ProviderReservationRef): Promise<ProviderReservation> {
    const parsed = providerReservationRefSchema.parse(ref);
    const id = toExactPositiveIntId(parsed.providerReservationId, {
      provider: "Booking Manager",
      what: "reservation id",
    });
    const endpoint = bookingManagerEndpoints.reservationById(id);

    const existing = await client.get(endpoint, restReservationSchema);

    if (existing.status === BM_RESERVATION_STATUS.RESERVATION) {
      throw new ContractError(
        `Booking Manager reservation ${id} is confirmed and cannot be cancelled through the API; it needs a cancellation request the operator approves out of band`,
        { endpoint, providerCode: "RESERVATION_NOT_CANCELLABLE" },
      );
    }
    if (existing.status === BM_RESERVATION_STATUS.SERVICE) {
      throw new ContractError(
        `Booking Manager reservation ${id} is a service block, not one of ours`,
        { endpoint, providerCode: "SERVICE_BLOCK" },
      );
    }

    await client.del(endpoint, cancelResponseSchema);

    const listingId =
      existing.yachtId == null
        ? ""
        : ((await resolver.toListingId(String(existing.yachtId))) ?? "");

    return providerReservationSchema.parse({
      id: String(id),
      provider: PROVIDER,
      // The delete response links back to nothing of ours; the caller already
      // holds the quote and only reads the status here.
      listingId,
      quoteId: "",
      status: "cancelled",
      providerReservationId: String(id),
    });
  }

  async function addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote> {
    const parsed = providerExtrasMutationSchema.parse(input);
    throw new ContractError(
      "Booking Manager exposes no reservation-extras endpoint: obligatory extras are priced into the offer and optional ones are agreed with the base",
      {
        endpoint: bookingManagerEndpoints.reservationById(parsed.ref.providerReservationId),
        providerCode: "EXTRAS_NOT_SUPPORTED",
      },
    );
  }

  function holdExpiresAt(response: RestReservation): string {
    if (!response.expirationDate) {
      // Without the vendor's own expiry we cannot know when it drops the option,
      // and a hold nothing ever releases would keep the slot unsellable.
      throw new ContractError("Booking Manager returned an option with no expirationDate", {
        endpoint: bookingManagerEndpoints.reservation,
        payload: { id: response.id },
      });
    }

    const till = parseBookingManagerDateTime(response.expirationDate, config.timeZone);
    // We must release first: expiring after the vendor has already dropped the
    // option means selling a slot that is no longer ours.
    return new Date(till.getTime() - config.optionSafetyMarginMinutes * 60_000).toISOString();
  }

  async function logEvent(
    quoteId: string,
    kind: ReservationEventKind,
    response: RestReservation,
  ): Promise<void> {
    await recordEvent({
      quoteId,
      kind,
      providerReference: String(response.id),
      payload: eventPayload(response),
    });
  }

  return { createOption, confirmBooking, cancelOption, addOrUpdateExtras };
}

/* ------------------------------------------------------------------ internals */

/**
 * The vendor takes a single `clientName`, checkout collects a given name and an
 * optional family name.
 */
function fullName(customer: BookingDraft["customer"]): string {
  const name = customer.name.trim();
  const surname = customer.surname?.trim();
  return surname ? `${name} ${surname}` : name;
}

/**
 * `3` (OPTION_IN_EXPIRATION) is still a live hold, so it maps to the same
 * canonical state as `2`. An absent or unknown status is refused rather than
 * assumed: reading a confirmed reservation as a hold would let the sweeper
 * release a sold charter.
 *
 * `5` (CANCELLED) is undocumented and is what every successful DELETE answers
 * with - the vendor transitions the record instead of removing it. Throwing on it
 * meant any read-back of a cancelled reservation failed.
 */
function toCanonicalStatus(
  response: RestReservation,
  endpoint: string,
): "option_held" | "confirmed" | "cancelled" {
  switch (response.status) {
    case BM_RESERVATION_STATUS.RESERVATION:
      return "confirmed";
    case BM_RESERVATION_STATUS.OPTION:
    case BM_RESERVATION_STATUS.OPTION_IN_EXPIRATION:
      return "option_held";
    case BM_RESERVATION_STATUS.CANCELLED:
      return "cancelled";
    default:
      throw new ContractError(
        `Booking Manager reservation ${response.id} came back with status ${JSON.stringify(response.status)} (${BM_RESERVATION_STATUS_NAMES.get(response.status ?? -1) ?? "unknown"})`,
        { endpoint, payload: { id: response.id, status: response.status } },
      );
  }
}

/**
 * `clientName` is PII under §10 and `commission` is our cut rather than the
 * customer's price. The event log is queried freely, so neither is written to it.
 */
function eventPayload(response: RestReservation) {
  return {
    id: response.id,
    reservationCode: response.reservationCode,
    status: response.status,
    yachtId: response.yachtId,
    dateFrom: response.dateFrom,
    dateTo: response.dateTo,
    expirationDate: response.expirationDate,
    clientPrice: response.clientPrice,
    currency: response.currency,
  };
}
