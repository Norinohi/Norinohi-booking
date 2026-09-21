import { z } from "zod";

import {
  formatInZone,
  formatNausysDate,
  parseNausysDate,
  parseNausysDateTime,
} from "../shared/dates";
import { decimalStringToMinor } from "../shared/money";
import type { ProviderReservationState, WaitingOptions } from "../types";
import type { JsonObject } from "../shared/json";
import type { NausysClient } from "./client";
import { nausysEndpoints, restYachtReservationSchema } from "./endpoints";

/**
 * What the operator's own record says about our reservations.
 *
 * NauSYS publishes no webhook and no event stream. It splits a reservation's life across three
 * lists that take the same request: `reservations` (fixed charters), `options` (holds) and
 * `stornos` (cancellations, with `canceledAt`). Reading only the first was reading only one of
 * three: a hold the operator released or changed never came back, and a charter it cancelled
 * moved into `stornos` where nothing looked, so the one change worth waking somebody for was
 * the one the pass could not see.
 *
 * Where the caller names the reservations it holds, they are asked about by id, which the vendor
 * answers whatever their modify time ("ignored if reservation ids sent") and whatever list they
 * now sit in, so a change older than the window is not missed either. Without ids all three
 * lists are read. Without ids the modify-time
 * window stands, verified against the live account (Sep 2026): 14 of the agency's 61
 * reservations answered for a two-month window, each carrying `lastModifiedAt`.
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
  /** The vendor reservation ids we hold open; asked about directly when given. */
  reservationIds?: readonly string[] | undefined;
}

/** Enough ids per call to keep a request small; the vendor states no limit. */
const IDS_PER_CALL = 100;

/** Which list wins when one id is in more than one: a cancellation outranks everything. */
const PRECEDENCE = {
  cancelled: 3,
  confirmed: 2,
  option_held: 1,
} satisfies Record<ProviderReservationState["status"], number>;

export async function listChangedNausysReservations(
  client: NausysClient,
  window: NausysChangeWindow,
  timeZone: string,
): Promise<ProviderReservationState[]> {
  const ids = (window.reservationIds ?? []).map(Number).filter((id) => Number.isSafeInteger(id));
  const filters: JsonObject[] =
    ids.length > 0
      ? chunk(ids, IDS_PER_CALL).map((batch) => ({ reservations: batch }))
      : [
          {
            modifyTimeFrom: nausysMinute(window.since, timeZone),
            modifyTimeTo: nausysMinute(window.until, timeZone),
          },
        ];
  /*
   * Asked by id, any one list answers for every reservation named, in its current status:
   * verified on the vendor's test company (Sep 2026), where four stornoed options came back
   * STORNO from `reservations`, `options` and `stornos` alike. The window has no ids to go by,
   * so it still needs all three.
   */
  const lists =
    ids.length > 0
      ? [nausysEndpoints.availability.reservations]
      : [
          nausysEndpoints.availability.reservations,
          nausysEndpoints.availability.options,
          nausysEndpoints.availability.stornos,
        ];

  const byId = new Map<string, ProviderReservationState>();
  for (const endpoint of lists) {
    for (const filter of filters) {
      const response = await client.bookingCall(
        endpoint,
        restReservationsResponseSchema,
        filter,
        // Background work, so the serialized lane: nobody is waiting on this answer.
        "sync",
      );
      for (const reservation of response.reservations ?? []) {
        const state = stateOf(reservation, timeZone);
        const held = byId.get(state.providerReservationId);
        if (!held || PRECEDENCE[state.status] > PRECEDENCE[held.status]) {
          byId.set(state.providerReservationId, state);
        }
      }
    }
  }
  return [...byId.values()];
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let at = 0; at < items.length; at += size) out.push(items.slice(at, at + size));
  return out;
}

function stateOf(
  reservation: z.infer<typeof restChangedReservationSchema>,
  timeZone: string,
): ProviderReservationState {
  /* The reservation lists carry `paymentCurrency` where the booking responses carry `currency`,
     and without one the price was dropped before anything could compare it. */
  const currency = reservation.currency ?? reservation.paymentCurrency;
  const priceMinor =
    reservation.clientPrice === undefined || currency === undefined
      ? undefined
      : minorOrUndefined(reservation.clientPrice, currency);

  return {
    providerReservationId: String(reservation.id),
    status: canonicalStatusOf(reservation.reservationStatus),
    providerStatus: reservation.reservationStatus,
    securityToken: reservation.uuid,
    externalYachtId: String(reservation.yachtId),
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
