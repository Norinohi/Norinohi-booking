import { booking, providerReservationEvent } from "@yacht-charter/db/schema/booking";
import type { InventoryProvider, ProviderReservation } from "@yacht-charter/providers";
import { ProviderError } from "@yacht-charter/providers/shared/errors";
import { eq } from "drizzle-orm";

import type { Database, DatabaseExecutor } from "../context";
import { getEnabledInventoryProviders } from "../context";
import type { BookingStatus } from "./booking-state";
import { enqueueOutbox } from "./outbox";

type BookingRow = typeof booking.$inferSelect;

/** `reason` is the vendor's own words, kept for the admin who has to act on them. */
export type ProviderRelease = { released: boolean; reason: string | null };

/** The jsonb body of a provider_reservation_event; `kind` says which arm applies. */
export type ProviderEventPayload =
  | { reservation: ProviderReservation }
  | { message: string | null }
  | { reason: string | null }
  | { released: boolean; error: string };

export async function recordEvent(
  db: DatabaseExecutor,
  bookingId: string,
  kind: typeof providerReservationEvent.$inferInsert.kind,
  provider: string,
  providerReference: string | null | undefined,
  payload: ProviderEventPayload,
): Promise<void> {
  await db.insert(providerReservationEvent).values({
    bookingId,
    kind,
    provider,
    providerReference: providerReference ?? null,
    payload: payload ?? null,
  });
}

/*
 * States in which the slot is no longer ours, so a held option is pure waste. Read by the retry
 * only: the direct callers release as part of moving the booking here and already know they want
 * it. By the time a retry runs the booking may have moved on, and a CONFIRMED charter's option
 * must never be handed back.
 */
const RELEASABLE: readonly BookingStatus[] = [
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "PROVIDER_REJECTED",
  "OPTION_EXPIRED",
  "QUOTE_EXPIRED",
];

/**
 * Hands the slot back to the vendor.
 *
 * Shared because three paths give a slot up: `cancelBooking`, `cancelInvoiceRequest` when staff
 * withdraw the invoice a booking was waiting on, and the outbox retry below.
 *
 * A refusal does not fail the caller. The customer's cancellation is legitimate whether or not
 * the vendor is reachable, and the booking has already been moved by the time this runs — so
 * throwing here would leave the row cancelled and the caller reporting failure. It is reported
 * back and queued instead: reported so the caller can say so, queued so it is actually retried.
 * The queueing is the part that used to be missing — the failure was recorded and then
 * forgotten, so a booking could read CANCELLED for good while the vendor still held the week
 * against every future customer.
 */
export async function releaseProviderOption(
  db: Database,
  provider: InventoryProvider,
  row: BookingRow,
): Promise<ProviderRelease> {
  /* Nothing was ever held, so nothing is still held. */
  if (!provider.capabilities().supportsOptions || !row.providerOptionId) {
    return { released: true, reason: null };
  }

  const reservationId = row.providerReservationId ?? row.providerOptionId;

  try {
    const released = await provider.cancelOption({
      providerReservationId: reservationId,
      securityToken: row.providerReservationUuid ?? undefined,
    });

    await db
      .update(booking)
      .set({
        providerReservationUuid: released.securityToken ?? row.providerReservationUuid,
        providerStatus: released.status,
      })
      .where(eq(booking.id, row.id));

    await recordEvent(db, row.id, "cancel_succeeded", row.provider, reservationId, {
      reservation: released,
    });

    return { released: true, reason: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Provider refused the release";

    // `provider_reservation_event_kind` has no cancel_failed; the sweeper reports
    // the same outcome the same way, as an attempted release that did not land.
    await recordEvent(db, row.id, "option_released", row.provider, reservationId, {
      released: false,
      error: reason,
    });

    /*
     * Queued only when a later attempt could land. Booking Manager refuses to release a
     * confirmed reservation at all, and that refusal arrives as a non-retryable ProviderError:
     * queueing it would spend the drain's whole backoff on a call that cannot succeed and then
     * give up loudly about the wrong thing. The signal there is `released: false` on the way
     * back, which is what stops the refund.
     *
     * Otherwise not kicked. A release that just failed is unlikely to succeed a millisecond
     * later, and the drain's own backoff is what gives the vendor time to come back; the
     * five-minute cron picks it up. `(kind, subject_id)` keeps repeated failures to one queued
     * job per booking.
     */
    if (!(error instanceof ProviderError) || error.retryable) {
      await enqueueOutbox(db, "release_option", row.id);
    }

    return { released: false, reason };
  }
}

/**
 * The outbox handler for a release that did not land. Throws on failure, which is how the drain
 * is told to back off and try again, and how it eventually gives up loudly rather than silently.
 */
export async function retryOptionRelease(db: Database, bookingId: string): Promise<void> {
  const [row] = await db.select().from(booking).where(eq(booking.id, bookingId)).limit(1);

  if (!row || !row.providerOptionId) return;

  /* Moved on since the failure — confirmed, or paid for. Nothing to give back. */
  if (!RELEASABLE.includes(row.status)) return;

  const providers = await getEnabledInventoryProviders();
  const provider = providers.get(row.provider);

  if (!provider) {
    throw new Error(`Provider "${row.provider}" is not enabled; cannot release ${bookingId}`);
  }

  if (!provider.capabilities().supportsOptions) return;

  const reservationId = row.providerReservationId ?? row.providerOptionId;
  const released = await provider.cancelOption({
    providerReservationId: reservationId,
    securityToken: row.providerReservationUuid ?? undefined,
  });

  await db
    .update(booking)
    .set({
      providerReservationUuid: released.securityToken ?? row.providerReservationUuid,
      providerStatus: released.status,
    })
    .where(eq(booking.id, bookingId));

  await recordEvent(db, bookingId, "cancel_succeeded", row.provider, reservationId, {
    reservation: released,
  });
}
