import { log, parseError } from "evlog";

import { ContractError, NotFoundError } from "../shared/errors";
import { thrownFields } from "../shared/log-fields";
import type { ProviderReservationState } from "../types";
import type { BookingManagerClient } from "./client";
import { parseBookingManagerDate, parseBookingManagerDateTime } from "./dates";
import {
  BM_RESERVATION_STATUS,
  BM_RESERVATION_STATUS_NAMES,
  bookingManagerEndpoints,
  restReservationSchema,
  type RestReservation,
} from "./endpoints";
import { numberToMinor } from "./money";

/**
 * What the operator's own record says about the reservations we hold.
 *
 * Read one by one with `GET /reservation/{id}`, the only read that answers for a record in every
 * status. The two lists that look like a delta are not one, measured on company 225
 * (2026-09-22): `/reservations/{year}` leaves every cancelled record out unless asked for
 * `status=5` alone, and is agency-wide rather than ours; `/objects/Reservation/search` with a
 * `lastSyncPoint` answered differently to the same request twice, moved its sync point
 * backwards, and missed cancellations that the single read reported. So the window is not used:
 * each reservation is asked about whatever changed it and whenever.
 *
 * One call at a time on the credential's shared lane, since nobody is waiting on the answer and
 * the account-wide call budget counts this pass as a single caller.
 */
export interface BookingManagerReservationWindow {
  /** The charter-side reservation ids we hold open; nothing is asked without them. */
  reservationIds?: readonly string[] | undefined;
}

export async function listChangedBookingManagerReservations(
  client: BookingManagerClient,
  window: BookingManagerReservationWindow,
  options: { timeZone: string; now: Date },
): Promise<ProviderReservationState[]> {
  const states: ProviderReservationState[] = [];
  for (const id of new Set(window.reservationIds ?? [])) {
    let record: RestReservation;
    try {
      record = await client.get(bookingManagerEndpoints.reservationById(id), restReservationSchema);
    } catch (cause) {
      /* One record the vendor cannot give us must not hide the rest; a vendor that is down or
         refuses the key fails the pass, so the reconcile reports it unreachable. */
      if (!(cause instanceof NotFoundError || cause instanceof ContractError)) throw cause;
      log.warn({
        action: "booking_manager.reconcile.reservation_unreadable",
        reservationId: id,
        ...thrownFields(parseError(cause)),
      });
      continue;
    }

    const state = reservationStateOf(id, record, options);
    if (state) states.push(state);
  }
  return states;
}

/**
 * The record in our terms, or nothing where the answer is for another reservation.
 *
 * `3` and a `2` past its `expirationDate` are both a hold that ran out rather than one anybody
 * cancelled. The vendor states no moment at which a lapsed option turns `3`, so the expiry is
 * read off the date as well as the status, and either way it keeps the week out of `/offers`
 * until the record is deleted (8192658760000107113 still did, at `3`, three weeks after it
 * expired). Both read as cancelled, as the booking chain reads `3`, and are marked `lapsed` so
 * the report does not blame the operator.
 */
export function reservationStateOf(
  askedId: string,
  record: RestReservation,
  options: { timeZone: string; now: Date },
): ProviderReservationState | undefined {
  /* A GET on the charter-side id answers with that record; the agency twin names it as its
     `charterReservationId`. Anything else is not the reservation we asked about. */
  if (record.id !== askedId && (record.charterReservationId ?? null) !== askedId) {
    log.warn({
      action: "booking_manager.reconcile.reservation_mismatch",
      reservationId: askedId,
      answeredId: record.id,
    });
    return undefined;
  }

  const lapsed =
    record.status === BM_RESERVATION_STATUS.OPTION_EXPIRED ||
    (record.status === BM_RESERVATION_STATUS.OPTION && expiredBy(record, options));

  const vendorStatus = record.status;
  let status: ProviderReservationState["status"];
  switch (vendorStatus) {
    case BM_RESERVATION_STATUS.RESERVATION:
      status = "confirmed";
      break;
    case BM_RESERVATION_STATUS.OPTION:
      status = lapsed ? "cancelled" : "option_held";
      break;
    case BM_RESERVATION_STATUS.OPTION_EXPIRED:
    case BM_RESERVATION_STATUS.CANCELLED:
      status = "cancelled";
      break;
    default:
      /* Ours was an option or a charter; a record now in any other status (a service or
         owner's week, a waiting option) was changed by somebody, and dropping it would let the
         run pass while the week is no longer the customer's. */
      log.warn({
        action: "booking_manager.reconcile.unexpected_status",
        reservationId: askedId,
        status: vendorStatus ?? null,
      });
      status = "unrecognised";
  }

  const currency = record.currency?.trim().toUpperCase() || undefined;
  const priceMinor = minorOrUndefined(record.clientPrice, currency);
  const checkIn = dayOrUndefined(record.dateFrom);
  const checkOut = dayOrUndefined(record.dateTo);

  return {
    providerReservationId: askedId,
    status,
    providerStatus:
      vendorStatus == null
        ? "UNKNOWN"
        : (BM_RESERVATION_STATUS_NAMES.get(vendorStatus) ?? String(vendorStatus)),
    ...(lapsed ? { lapsed } : null),
    ...(record.yachtId == null ? null : { externalYachtId: record.yachtId }),
    ...(checkIn === undefined ? null : { checkIn }),
    ...(checkOut === undefined ? null : { checkOut }),
    ...(priceMinor === undefined || currency === undefined ? null : { priceMinor, currency }),
  };
}

function expiredBy(record: RestReservation, options: { timeZone: string; now: Date }): boolean {
  if (!record.expirationDate) return false;
  try {
    const till = parseBookingManagerDateTime(record.expirationDate, options.timeZone);
    return till.getTime() <= options.now.getTime();
  } catch {
    return false;
  }
}

function dayOrUndefined(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return parseBookingManagerDate(value);
  } catch {
    return undefined;
  }
}

function minorOrUndefined(
  value: number | null | undefined,
  currency: string | undefined,
): number | undefined {
  if (value == null || currency === undefined) return undefined;
  try {
    return numberToMinor(value, currency, "clientPrice");
  } catch {
    return undefined;
  }
}
