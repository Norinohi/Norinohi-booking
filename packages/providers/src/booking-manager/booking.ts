import { booking, SLOT_HOLDING_STATUSES } from "@yacht-charter/db/schema/booking";
import { and, eq, inArray, or } from "drizzle-orm";
import { log, parseError } from "evlog";
import { z } from "zod";

import type { Database } from "../registry";
import type { CatalogueResolver } from "../shared/catalogue-resolver";
import {
  ContractError,
  OWN_OPTION_HELD,
  PRODUCT_NOT_OFFERED,
  ProviderError,
  SlotUnavailableError,
  TransientError,
} from "../shared/errors";
import { crewListLinkFrom } from "../shared/crew-list-link";
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
  type OperatorSettlement,
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
  BM_RESERVATION_REFUSAL,
  BM_RESERVATION_STATUS,
  BM_RESERVATION_STATUS_NAMES,
  bookingManagerEndpoints,
  isSameBookingManagerProduct,
  restOfferListSchema,
  restReservationListSchema,
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
 * `clientPrice` is what the reservation should answer as its own `clientPrice`: the charter net
 * of the vendor's discounts plus the obligatory extras paid online, which POST adds unasked.
 */
export type VerifyPrice = (draft: BookingDraft) => Promise<VerifiedPrice>;

export interface VerifiedPrice {
  hash: string;
  clientPrice?: Money;
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
   * Which of our live bookings, if any, holds a reservation known by any of these ids. Asked
   * before an option of ours found on the slot is released or taken over, since it may be
   * another customer's hold. Defaults to reading `booking`.
   */
  bookingHolding?: (reservationIds: readonly string[]) => Promise<string | undefined>;
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
  const bookingHolding = deps.bookingHolding ?? ((ids) => liveBookingHolding(db, ids));

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

    const request = await reservationRequest(parsed);
    const { terms } = request;
    let response: RestReservation;
    let agencyId: string | undefined;
    try {
      response = await client.post(
        bookingManagerEndpoints.reservation,
        restReservationSchema,
        request.body,
      );
    } catch (cause) {
      const ownOption =
        cause instanceof SlotUnavailableError &&
        cause.providerCode === BM_RESERVATION_REFUSAL.OWN_OPTION_EXISTS;
      if (!ownOption && !(cause instanceof TransientError)) {
        throw cause instanceof SlotUnavailableError ? refusalInOurTerms(cause, terms) : cause;
      }
      ({ response, agencyId } = await settleOwnOption(request, current, cause));
    }

    await logEvent(parsed.quoteId, "option_created", response);

    if (response.status !== BM_RESERVATION_STATUS.OPTION) await refuseNotAnOption(response);

    const substituted = substitutionsIn(response, terms, current.clientPrice);
    if (substituted.length > 0) await refuseSubstituted(response, substituted);

    return heldOption(parsed, response, agencyId);
  }

  /**
   * What to do once the vendor may already hold an option of ours on the slot: after POST
   * answered "own Option exists", or did not answer at all, which with no idempotency key (Q10)
   * leaves an option it opened unreported.
   *
   * The option is looked up rather than the create sent again. One no live booking of ours holds
   * is an orphan: taken over when it is open and on exactly our terms for this customer, which
   * is the create that timed out, and otherwise released and the create sent once more. One a
   * live booking holds is that booking's, and the slot is refused. Where nothing is found, or the
   * lookup fails, the original refusal stands.
   */
  async function settleOwnOption(
    request: { body: ReservationBody; terms: ReservationTerms },
    verified: VerifiedPrice,
    cause: ProviderError,
  ): Promise<{ response: RestReservation; agencyId: string | undefined }> {
    const { body, terms } = request;
    const original =
      cause instanceof SlotUnavailableError ? refusalInOurTerms(cause, terms) : cause;
    const trigger = cause instanceof TransientError ? "no_answer" : "own_option_exists";

    let found: OwnOption | undefined;
    try {
      found = await findOwnOption(terms);
    } catch (lookup) {
      log.warn({
        action: "booking_manager.reservation.own_option_lookup_failed",
        yachtId: terms.yachtId,
        checkIn: terms.checkIn,
        trigger,
        ...thrownFields(parseError(lookup)),
      });
      throw original;
    }
    if (!found) {
      log.warn({
        action: "booking_manager.reservation.own_option_not_found",
        yachtId: terms.yachtId,
        checkIn: terms.checkIn,
        trigger,
      });
      throw original;
    }

    const ids = [found.charterId, found.agencyId].filter((id): id is string => id !== undefined);
    const holder = await bookingHolding(ids);
    if (holder) {
      throw new SlotUnavailableError(
        `Booking Manager slot for yacht ${terms.yachtId} from ${terms.checkIn} is held by our own option ${ids.join("/")}, which booking ${holder} holds`,
        {
          endpoint: bookingManagerEndpoints.reservation,
          providerCode: OWN_OPTION_HELD,
          payload: { reservationIds: ids, bookingId: holder },
        },
      );
    }

    const record = found.record;
    const adoptable =
      record.status === BM_RESERVATION_STATUS.OPTION &&
      sameClientName(record.clientName, body.clientName) &&
      substitutionsIn(record, terms, verified.clientPrice).length === 0;
    if (adoptable) {
      log.warn({
        action: "booking_manager.reservation.own_option_adopted",
        reservationId: String(record.id),
        agencyReservationId: found.agencyId,
        trigger,
      });
      return { response: record, agencyId: found.agencyId };
    }

    const orphan = found.charterId ?? String(record.id);
    const released = await releaseQuietly(orphan, "orphaned");
    log.warn({
      action: "booking_manager.reservation.own_option_released",
      reservationId: orphan,
      agencyReservationId: found.agencyId,
      status: record.status ?? null,
      released,
      trigger,
    });
    if (!released) throw original;

    try {
      return {
        response: await client.post(
          bookingManagerEndpoints.reservation,
          restReservationSchema,
          body,
        ),
        agencyId: undefined,
      };
    } catch (again) {
      throw again instanceof SlotUnavailableError ? refusalInOurTerms(again, terms) : again;
    }
  }

  /**
   * The option this agency holds on the yacht for the charter, charter-side record first.
   *
   * `showOptions` names an open one by its agency-side id; an expired one (`3`) it leaves out
   * altogether although it still blocks the slot, so `/reservations/{year}` for the month the
   * charter starts in is asked next, where agency records carry `charterReservationId`. The
   * charter-side record is what POST would have answered with, and the only one carrying the
   * price, the plan and the crew link.
   */
  async function findOwnOption(terms: ReservationTerms): Promise<OwnOption | undefined> {
    const offers = await client.get(
      bookingManagerEndpoints.offers,
      restOfferListSchema,
      {
        dateFrom: formatBookingManagerDateTime(terms.checkIn),
        dateTo: formatBookingManagerDateTime(terms.checkOut),
        yachtId: [terms.yachtId],
        showOptions: true,
      },
      client.liveLane(),
    );
    let agencyId = offers.find(
      (offer) =>
        offer.yachtId === terms.yachtId &&
        offer.myReservationId != null &&
        calendarDateOf(offer.dateFrom) === terms.checkIn &&
        calendarDateOf(offer.dateTo) === terms.checkOut,
    )?.myReservationId;
    let charterId: string | undefined;

    if (agencyId == null) {
      const listed = await client.get(
        bookingManagerEndpoints.reservationsByYear(Number(terms.checkIn.slice(0, 4))),
        restReservationListSchema,
        { month: Number(terms.checkIn.slice(5, 7)) },
        client.liveLane(),
      );
      const ours = listed.find(
        (row) =>
          row.yachtId === terms.yachtId &&
          (row.status === BM_RESERVATION_STATUS.OPTION ||
            row.status === BM_RESERVATION_STATUS.OPTION_EXPIRED) &&
          calendarDateOf(row.dateFrom) === terms.checkIn &&
          calendarDateOf(row.dateTo) === terms.checkOut,
      );
      if (!ours) return undefined;
      agencyId = ours.id;
      charterId = ours.charterReservationId ?? undefined;
    }

    if (charterId === undefined) {
      const twin = await client.get(
        bookingManagerEndpoints.reservationById(agencyId),
        restReservationSchema,
        undefined,
        client.liveLane(),
      );
      charterId = twin.charterReservationId ?? undefined;
      if (charterId === undefined) return { agencyId, record: twin };
    }

    const record = await client.get(
      bookingManagerEndpoints.reservationById(charterId),
      restReservationSchema,
      undefined,
      client.liveLane(),
    );
    return { charterId, agencyId, record };
  }

  /** An open option the vendor answered with, in our terms. */
  function heldOption(
    draft: BookingDraft,
    response: RestReservation,
    agencyId?: string,
  ): ProviderReservation {
    const reservationId = String(response.id);
    const settlement = operatorSettlementOf(response);
    const crewListLink = crewListLinkFrom(response.crewListLink);

    return providerReservationSchema.parse({
      id: reservationId,
      provider: PROVIDER,
      listingId: draft.listingId,
      quoteId: draft.quoteId,
      status: toCanonicalStatus(response, bookingManagerEndpoints.reservation),
      // Booking Manager keeps one id across the option and the reservation it
      // becomes, so the option and the booking are the same handle.
      providerReservationId: reservationId,
      providerOptionId: reservationId,
      holdExpiresAt: holdExpiresAt(response),
      checkInTime: wallClockTime(response.dateFrom),
      checkOutTime: wallClockTime(response.dateTo),
      ...(agencyId ? { providerAgencyReservationId: agencyId } : null),
      ...(crewListLink ? { crewListLink } : null),
      ...(settlement ? { operatorSettlement: settlement } : null),
    });
  }

  /**
   * POST can only open an option (`2`), and anything else is a record we cannot hold a customer
   * to. `9` is the one measured: a second option queued behind a hold already on the slot, with
   * no expiry and blocking nothing, so it is released rather than left behind.
   */
  async function refuseNotAnOption(response: RestReservation): Promise<never> {
    const status = response.status ?? null;
    let released = false;
    if (status === BM_RESERVATION_STATUS.OPTION_ON_WAITING) {
      released = await releaseQuietly(String(response.id), "not_an_option");
    }
    throw new ContractError(
      `Booking Manager answered the reservation with ${response.id} in status ${JSON.stringify(status)} (${BM_RESERVATION_STATUS_NAMES.get(status ?? -1) ?? "unknown"}), not an option`,
      {
        endpoint: bookingManagerEndpoints.reservation,
        providerCode: "NOT_AN_OPTION",
        payload: { id: response.id, status, released },
      },
    );
  }

  /** Best effort: an option it fails to free lapses at its own expiry, and the log names it. */
  async function releaseQuietly(reservationId: string, reason: string): Promise<boolean> {
    try {
      await client.del(
        bookingManagerEndpoints.reservationById(reservationId),
        cancelResponseSchema,
      );
      return true;
    } catch (cause) {
      log.error({
        action: "booking_manager.reservation.release_failed",
        reservationId,
        reason,
        ...thrownFields(parseError(cause)),
      });
      return false;
    }
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
    const crewListLink = crewListLinkFrom(response.crewListLink);
    const agencyId = response.id === id ? undefined : String(response.id);

    return providerReservationSchema.parse({
      id: reservationId,
      provider: PROVIDER,
      listingId: parsed.listingId,
      quoteId: parsed.quoteId,
      status: toCanonicalStatus(response, endpoint),
      providerReservationId: reservationId,
      providerOptionId: parsed.reservation.providerOptionId ?? reservationId,
      ...(agencyId ? { providerAgencyReservationId: agencyId } : null),
      ...(crewListLink ? { crewListLink } : null),
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
   *
   * An expired option (`3`) is deleted like a live one. Expiry does not free the week: the
   * vendor keeps it out of `/offers` for as long as the record stands, so a lapsed hold of
   * ours left alone is a boat nobody can sell. Whether the vendor accepts that DELETE is
   * unmeasured (Q19), so a refusal is reported as a release that did not land rather than as
   * a cancelled option.
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

    try {
      await client.del(endpoint, cancelResponseSchema);
    } catch (cause) {
      if (existing.status !== BM_RESERVATION_STATUS.OPTION_EXPIRED) throw cause;
      if (cause instanceof ProviderError && cause.retryable) throw cause;
      throw new ContractError(
        `Booking Manager option ${id} has expired and still blocks its week, and the vendor refused to delete it; the operator has to release it`,
        { endpoint, providerCode: "EXPIRED_OPTION_NOT_RELEASED", cause },
      );
    }

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
    const released = await releaseQuietly(String(response.id), "substituted");
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

/** An option of ours found on a slot; `charterId` is absent where the vendor named no twin. */
interface OwnOption {
  charterId?: string;
  agencyId: string;
  record: RestReservation;
}

/** The booking of ours still holding a reservation known by any of these ids. */
export async function liveBookingHolding(
  db: Database,
  reservationIds: readonly string[],
): Promise<string | undefined> {
  if (reservationIds.length === 0) return undefined;
  const ids = [...reservationIds];
  const [row] = await db
    .select({ id: booking.id })
    .from(booking)
    .where(
      and(
        eq(booking.provider, PROVIDER),
        inArray(booking.status, [...SLOT_HOLDING_STATUSES]),
        or(
          inArray(booking.providerReservationId, ids),
          inArray(booking.providerOptionId, ids),
          inArray(booking.providerAgencyReservationId, ids),
        ),
      ),
    )
    .limit(1);
  return row?.id;
}

/** `clientName` is all the vendor keeps of the customer, so it is what tells two holds apart. */
function sameClientName(held: string | null | undefined, ours: string): boolean {
  const normal = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
  return held != null && normal(held) === normal(ours);
}

/**
 * A POST refusal restated in the taxonomy the booking chain reads.
 *
 * "Price not defined" answers a product the vendor does not price for the charter, and the
 * product is ours, from the last catalogue sync, so with one named it is a refusal of our terms
 * rather than of the week. "Own option exists" is our own hold on the slot, which no one else
 * has bought.
 */
function refusalInOurTerms(
  cause: SlotUnavailableError,
  terms: ReservationTerms,
): SlotUnavailableError {
  const restated = (providerCode: string) =>
    new SlotUnavailableError(cause.message, {
      endpoint: cause.endpoint,
      providerCode,
      payload: { refusal: cause.providerCode },
      cause,
    });
  if (cause.providerCode === BM_RESERVATION_REFUSAL.OWN_OPTION_EXISTS) {
    return restated(OWN_OPTION_HELD);
  }
  if (cause.providerCode === BM_RESERVATION_REFUSAL.PRICE_NOT_DEFINED && terms.productName) {
    return restated(PRODUCT_NOT_OFFERED);
  }
  return cause;
}

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
  clientPrice: Money | undefined,
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
    clientPrice !== undefined &&
    response.clientPrice != null &&
    currency !== undefined &&
    sameText(currency, clientPrice.currency)
  ) {
    const answeredMinor = numberToMinor(response.clientPrice, currency, "clientPrice");
    if (Math.abs(answeredMinor - clientPrice.amountMinor) > 1) {
      found.push({
        field: "clientPrice",
        asked: String(clientPrice.amountMinor),
        answered: String(answeredMinor),
      });
    }
  }
  return found;
}

/**
 * What we owe the operator, off the charter-side record, which alone carries it: `finalPrice` is
 * the charter net of our commission there, and `agencyPaymentPlan` its instalments. The agency
 * twin has no `agencyPaymentPlan` and a `finalPrice` equal to the client's, so nothing is read
 * from a record without the plan. `bankDetails` is left behind on purpose: operator bank
 * accounts are not kept anywhere in our data (see `withoutOperatorFinancials`).
 */
export function operatorSettlementOf(response: RestReservation): OperatorSettlement | undefined {
  const currency = response.currency?.trim().toUpperCase();
  if (!currency || !Array.isArray(response.agencyPaymentPlan)) return undefined;

  const plan = response.agencyPaymentPlan.flatMap((entry) =>
    entry.amount == null || !entry.date
      ? []
      : [
          {
            dueDate: parseBookingManagerDate(entry.date),
            amountMinor: numberToMinor(entry.amount, currency, "agencyPaymentPlan[].amount"),
          },
        ],
  );
  const terms = response.termsOfPayment?.trim();
  return {
    currency,
    ...(response.finalPrice == null
      ? null
      : { netMinor: numberToMinor(response.finalPrice, currency, "finalPrice") }),
    plan,
    ...(terms ? { terms } : null),
  };
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
 * An absent or unknown status is refused rather than assumed: reading a confirmed
 * reservation as a hold would let the sweeper release a sold charter.
 *
 * `3` (OPTION_EXPIRED) is a hold that is over, so it reads as closed beside `5`,
 * although the vendor goes on blocking the week until the record is deleted; see
 * `cancelOption`.
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
      return "option_held";
    case BM_RESERVATION_STATUS.OPTION_EXPIRED:
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
