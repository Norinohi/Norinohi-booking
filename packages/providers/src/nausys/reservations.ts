import { z } from "zod";

import {
  formatInZone,
  formatNausysDate,
  parseNausysDate,
  parseNausysDateTime,
} from "../shared/dates";
import { decimalStringToMinor } from "../shared/money";
import type { ProviderReservationState, WaitingOptions } from "../types";
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

/**
 * The queue behind a week the operator has already sold.
 *
 * The response is unlike anything else in this API: the count arrives as a string under
 * `waitingOptions`, and each queued reservation as a *key* of its own —
 * `{"waitingOptions":"6","id: 890270154":"queuePosition: 2"}`. So it is read key by key rather
 * than parsed into a shape, and a vendor that tidies this up later simply stops matching and
 * leaves the count, which is the number support is actually asked for.
 */
const restWaitingOptionsSchema = z.looseObject({
  status: z.string(),
  waitingOptions: z.union([z.string(), z.number()]).optional(),
});

const QUEUE_KEY = /^id:\s*(\d+)$/;
const QUEUE_POSITION = /queuePosition:\s*(\d+)/;

export async function readNausysWaitingOptions(
  client: NausysClient,
  yachtId: number,
  period: { from: string; to: string },
): Promise<WaitingOptions> {
  const response = await client.bookingCall(
    nausysEndpoints.availability.waitingOptions,
    restWaitingOptionsSchema,
    {
      yacht: yachtId,
      periodFrom: formatNausysDate(period.from),
      periodTo: formatNausysDate(period.to),
    },
    "sync",
  );

  /* Parsed key by key, because the queue rides in the keys: see the schema's note. */
  const queue: WaitingOptions["queue"] = [];
  for (const [key, value] of Object.entries(response)) {
    const named = QUEUE_KEY.exec(key);
    const said = z.string().safeParse(value);
    if (!named?.[1] || !said.success) continue;

    const position = QUEUE_POSITION.exec(said.data);
    if (position?.[1]) queue.push({ reservationId: named[1], position: Number(position[1]) });
  }

  return {
    count: Number(response.waitingOptions ?? queue.length) || queue.length,
    queue: queue.sort((left, right) => left.position - right.position),
  };
}
