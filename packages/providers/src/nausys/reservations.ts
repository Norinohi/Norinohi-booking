import { z } from "zod";

import { formatInZone, parseNausysDate, parseNausysDateTime } from "../shared/dates";
import { decimalStringToMinor } from "../shared/money";
import type { ProviderReservationState } from "../types";
import type { NausysClient } from "./client";
import { nausysEndpoints, restYachtReservationSchema } from "./endpoints";

/**
 * The reservations the operator touched inside a window.
 *
 * `reservations` filters by modify time (`modifyTimeFrom`/`modifyTimeTo`), which is the only
 * change feed NauSYS publishes: no webhook, no event stream. Verified against the live account
 * (Sep 2026) -- 14 of the agency's 61 reservations answered for a two-month window, each
 * carrying `lastModifiedAt`.
 *
 * Without it nothing ever re-read a reservation. Our copy is written once, at the moment we
 * act on it, so an operator who cancels a charter, moves its dates or reprices it leaves our
 * booking saying what it said the day it was made.
 */
const restChangedReservationSchema = restYachtReservationSchema.extend({
  lastModifiedAt: z.string().optional(),
});

const restReservationsResponseSchema = z.looseObject({
  status: z.string(),
  errorCode: z.number().int().optional(),
  reservations: z.array(restChangedReservationSchema).optional(),
});

export interface NausysChangeWindow {
  since: Date;
  until: Date;
}

export async function listChangedNausysReservations(
  client: NausysClient,
  window: NausysChangeWindow,
  timeZone: string,
): Promise<ProviderReservationState[]> {
  const response = await client.bookingCall(
    nausysEndpoints.availability.reservations,
    restReservationsResponseSchema,
    {
      modifyTimeFrom: nausysMinute(window.since, timeZone),
      modifyTimeTo: nausysMinute(window.until, timeZone),
    },
    // Background work, so the serialized lane: nobody is waiting on this answer.
    "sync",
  );

  return (response.reservations ?? []).map((reservation) => stateOf(reservation, timeZone));
}

function stateOf(
  reservation: z.infer<typeof restChangedReservationSchema>,
  timeZone: string,
): ProviderReservationState {
  const currency = reservation.currency;
  const priceMinor =
    reservation.clientPrice === undefined || currency === undefined
      ? undefined
      : minorOrUndefined(reservation.clientPrice, currency);

  return {
    providerReservationId: String(reservation.id),
    status: canonicalStatusOf(reservation.reservationStatus),
    providerStatus: reservation.reservationStatus,
    securityToken: reservation.uuid,
    checkIn: dayOrUndefined(reservation.periodFrom),
    checkOut: dayOrUndefined(reservation.periodTo),
    ...(priceMinor === undefined ? null : { priceMinor, currency }),
    ...(reservation.lastModifiedAt === undefined
      ? null
      : { lastModifiedAt: instantOrUndefined(reservation.lastModifiedAt, timeZone) }),
  };
}

/**
 * The same three-way reading the booking path uses: anything that is neither a confirmed
 * reservation nor a cancellation is a hold of some kind, which is the safe side to err on.
 */
function canonicalStatusOf(status: string): ProviderReservationState["status"] {
  switch (status) {
    case "RESERVATION":
      return "confirmed";
    case "STORNO":
      return "cancelled";
    default:
      return "option_held";
  }
}

/** `dd.MM.yyyy HH:mm` in the vendor's own zone, which is what the filter is stated in. */
function nausysMinute(at: Date, timeZone: string): string {
  return formatInZone(at, timeZone);
}

function dayOrUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    /* The reservation list dates carry a time; the day in front of it is what we compare. */
    return parseNausysDate(value.split(" ")[0] ?? value);
  } catch {
    return undefined;
  }
}

function instantOrUndefined(value: string, timeZone: string): string | undefined {
  try {
    return parseNausysDateTime(value, timeZone).toISOString();
  } catch {
    return undefined;
  }
}

function minorOrUndefined(value: string, currency: string): number | undefined {
  try {
    return decimalStringToMinor(value, currency);
  } catch {
    return undefined;
  }
}
