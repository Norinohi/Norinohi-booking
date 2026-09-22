import { log, parseError } from "evlog";
import { z } from "zod";

import type { Database } from "../registry";
import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { ContractError } from "../shared/errors";
import { exactJsonNumber } from "../shared/exact-json";
import { thrownFields } from "../shared/log-fields";
import { toExactPositiveIntId } from "../shared/projection-helpers";
import { wallClockTime } from "../shared/wall-clock";
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
  type Money,
  type ProviderExtrasMutation,
  type ProviderQuote,
  type ProviderReservation,
  type ProviderReservationRef,
} from "../types";
import type { BookingManagerClient } from "./client";
import type { BookingManagerConfig } from "./config";
import {
  formatBookingManagerDateTime,
  parseBookingManagerDate,
  parseBookingManagerDateTime,
} from "./dates";
import { numberToMinor } from "./money";
import {
  BM_RESERVATION_STATUS,
  BM_RESERVATION_STATUS_NAMES,
  bookingManagerEndpoints,
  isSameBookingManagerProduct,
  restReservationSchema,
  type RestReservation,
} from "./endpoints";

const PROVIDER = "booking_manager" as const;

/**
 * A base id the vendor will take back: digits without a leading zero, where `0` itself is a real
 * base (Marina Cienfuegos on company 225) and ids run from one digit to nineteen.
 */
const BASE_ID = /^(?:0|[1-9]\d*)$/;

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
 *
 * `charterPrice` is the charter alone, net of the vendor's discounts and without extras,
 * which is the figure the reservation answers as `clientPrice`.
 */
export type VerifyPrice = (draft: BookingDraft) => Promise<VerifiedPrice>;

export interface VerifiedPrice {
  hash: string;
  charterPrice?: Money;
}

export interface BookingManagerBookingServiceDeps {
  client: BookingManagerClient;
  resolver: CatalogueResolver;
  config: BookingManagerConfig;
  db: Database;
  verifyPrice: VerifyPrice;
  recordEvent?: ReservationEventRecorder;
  /**
   * The account's billing currency, for a draft that carries none. A draft's own currency is
   * the quote's, and wins: the vendor prices per currency, so any other one holds a different
   * figure from the one the customer accepted.
   */
  currency?: string;
  /** The listing's product for a vendor yacht; the same loader the quote names it from. */
  loadProductName?: (externalYachtId: string) => Promise<string | undefined>;
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
 * What the reservation was asked to be, in the terms the vendor answers with, so the answer can be
 * checked against it. Bases and product are what we sent; undefined is something we left to it.
 */
export interface ReservationTerms {
  yachtId: string;
  checkIn: string;
  checkOut: string;
  startBaseId: string | undefined;
  endBaseId: string | undefined;
  productName: string | undefined;
  currency: string;
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
    return (await reservationRequest(draft, status)).body;
  }

  async function reservationRequest(
    draft: BookingDraft,
    status?: number,
  ): Promise<{ body: ReservationBody; terms: ReservationTerms }> {
    const ref = await resolver.toExternalListing(draft.listingId);
    const yachtId = toExactPositiveIntId(ref.externalYachtId, {
      provider: "Booking Manager",
      what: `listing ${draft.listingId}`,
    });
    const baseId = ref.externalBaseId?.trim() || undefined;
    const productName = await deps.loadProductName?.(yachtId);
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
      currency: draft.currency ?? currency,
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
    const terms: ReservationTerms = {
      yachtId,
      checkIn: draft.checkIn,
      checkOut: draft.checkOut,
      startBaseId: undefined,
      endBaseId: undefined,
      productName,
      currency: body.currency,
    };
    if (startBase !== undefined && BASE_ID.test(startBase)) {
      body.baseFromId = exactJsonNumber(startBase);
      terms.startBaseId = startBase;
    }
    if (endBase !== undefined && BASE_ID.test(endBase)) {
      body.baseToId = exactJsonNumber(endBase);
      terms.endBaseId = endBase;
    }
    if (clientId !== undefined) body.clientId = clientId;
    return { body, terms };
  }

  async function createOption(draft: BookingDraft): Promise<ProviderReservation> {
    const parsed = bookingDraftSchema.parse(draft);

    // Before anything is created: `/offers` leaves no provider-side artifact, so
    // this hash is the only link between the price the customer accepted and the
    // reservation about to be opened.
    const current = await verifyPrice(parsed);
    if (current.hash !== parsed.priceSourceHash) {
      throw new ContractError(
        "PRICE_CHANGED: the Booking Manager price moved between the quote and the hold",
        {
          endpoint: bookingManagerEndpoints.reservation,
          providerCode: "PRICE_CHANGED",
          payload: { expected: parsed.priceSourceHash, actual: current.hash },
        },
      );
    }

    const { body, terms } = await reservationRequest(parsed);
    const response = await client.post(
      bookingManagerEndpoints.reservation,
      restReservationSchema,
      body,
    );

    await logEvent(parsed.quoteId, "option_created", response);

    const substituted = substitutionsIn(response, terms, current.charterPrice);
    if (substituted.length > 0) await refuseSubstituted(response, substituted);

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
      checkInTime: wallClockTime(response.dateFrom),
      checkOutTime: wallClockTime(response.dateTo),
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
   * There is no way around this, in either API. The SOAP service carries the same
   * limitation verbatim - `cancelReservation` "Cancels a option. An already
   * confirmed booking is not possible to cancel automatically"
   * (availability_service_description v1.26, 1.13) - and the vendor confirmed in
   * writing on 2026-08-25 that a confirmed reservation is cancelled by contacting
   * the charter company, through neither the API nor their own UI.
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

  /**
   * The REST API genuinely has no endpoint for this, confirmed by the vendor on
   * 2026-08-25. Their SOAP service does - `insertOptionItem(userId, username,
   * password, reservationId, optionItemId, amount)`, with `insertDiscountItem`
   * and `removeInvoiceItem` alongside it (availability_service_description v1.26,
   * 3.12-3.14).
   *
   * Reaching it is not a small change and is not attempted here: SOAP
   * authenticates with a userId/username/password triple rather than the bearer
   * token this adapter holds, so it is a second credential to obtain, store and
   * rotate for one call.
   */
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

  /**
   * Releases an option the vendor opened on terms other than ours, and refuses it.
   *
   * POST answers 201 whatever it made of the body: measured on company 225, a drop-off it does
   * not sell (136) came back as the home base (127), USD came back as EUR, and a body with no
   * product took the default. Kept, that is a charter at another marina, in another currency or
   * of another product than the one the customer paid for. The release is best effort: an option
   * it fails to free lapses at its own expiry, and the event says which one to look at.
   */
  async function refuseSubstituted(
    response: RestReservation,
    substituted: readonly Substitution[],
  ): Promise<never> {
    const endpoint = bookingManagerEndpoints.reservationById(String(response.id));
    let released = true;
    try {
      await client.del(endpoint, cancelResponseSchema);
    } catch (cause) {
      released = false;
      log.error({
        action: "booking_manager.reservation.substitute_not_released",
        reservationId: String(response.id),
        ...thrownFields(parseError(cause)),
      });
    }
    log.warn({
      action: "booking_manager.reservation.substituted",
      reservationId: String(response.id),
      released,
      fields: substituted.map((entry) => entry.field).join(","),
    });
    throw new ContractError(
      `Booking Manager opened reservation ${response.id} on other terms than asked: ${substituted
        .map((entry) => `${entry.field} ${entry.asked} became ${entry.answered}`)
        .join("; ")}`,
      {
        endpoint: bookingManagerEndpoints.reservation,
        providerCode: "RESERVATION_SUBSTITUTED",
        payload: { id: response.id, released, substituted },
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

/** The day of a vendor timestamp, or the text as sent where it is not one, which then differs. */
function calendarDateOf(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return parseBookingManagerDate(value);
  } catch {
    return value;
  }
}

export interface Substitution {
  field:
    | "yachtId"
    | "dateFrom"
    | "dateTo"
    | "baseFromId"
    | "baseToId"
    | "productName"
    | "currency"
    | "clientPrice";
  asked: string;
  answered: string;
}

/**
 * Every term the reservation came back with that is not the one asked for. A term the answer
 * leaves out is not a substitution: the check is on what the vendor says it made.
 */
export function substitutionsIn(
  response: RestReservation,
  terms: ReservationTerms,
  charterPrice: Money | undefined,
): Substitution[] {
  const found: Substitution[] = [];
  const differs = (
    field: Substitution["field"],
    asked: string | undefined,
    answered: string | null | undefined,
    same: (left: string, right: string) => boolean = (left, right) => left === right,
  ) => {
    if (asked === undefined || answered == null) return;
    if (!same(asked, answered)) found.push({ field, asked, answered });
  };
  const sameText = (left: string, right: string) =>
    left.trim().toUpperCase() === right.trim().toUpperCase();

  differs("yachtId", terms.yachtId, response.yachtId);
  differs("dateFrom", terms.checkIn, calendarDateOf(response.dateFrom));
  differs("dateTo", terms.checkOut, calendarDateOf(response.dateTo));
  differs("baseFromId", terms.startBaseId, response.baseFromId);
  differs("baseToId", terms.endBaseId, response.baseToId);
  differs("productName", terms.productName, response.productName, isSameBookingManagerProduct);
  differs("currency", terms.currency, response.currency, sameText);

  /* The price is only comparable in the money it was quoted in; a currency swap is reported above. */
  const currency = response.currency?.trim();
  if (
    charterPrice !== undefined &&
    response.clientPrice != null &&
    currency !== undefined &&
    sameText(currency, charterPrice.currency)
  ) {
    const answeredMinor = numberToMinor(response.clientPrice, currency, "clientPrice");
    if (Math.abs(answeredMinor - charterPrice.amountMinor) > 1) {
      found.push({
        field: "clientPrice",
        asked: String(charterPrice.amountMinor),
        answered: String(answeredMinor),
      });
    }
  }
  return found;
}

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
