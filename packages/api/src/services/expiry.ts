import { booking, payment, providerReservationEvent } from "@yacht-charter/db/schema/booking";
import { invoiceRequest } from "@yacht-charter/db/schema/checkout";
import { quote } from "@yacht-charter/db/schema/quote";
import type { InventoryProvider } from "@yacht-charter/providers";
import { reapStaleSyncRuns } from "@yacht-charter/providers/sync/run";
import { and, eq, gt, inArray, isNotNull, lte, ne, notExists, sql } from "drizzle-orm";

import type { Database } from "../context";
import { providerByKey } from "./provider-routing";
import {
  DEAD_QUOTE_SWEEP,
  HOLD_SWEEP,
  STALE_PAYMENT_SWEEP,
  assertTransition,
  type BookingStatus,
} from "./booking-state";
import { pruneListingViews } from "./listing-view";

export type SweepResult = {
  quotesExpired: number;
  holdsExpired: number;
  bookingsQuoteExpired: number;
  /** Checkouts abandoned at the payment step, whose slot nothing else would ever release. */
  paymentsAbandoned: number;
  /** Provider releases that failed. The booking still expires; this is for ops. */
  releaseFailures: { bookingId: string; message: string }[];
  /** View rows dropped past their retention window — unrelated to expiry, but the
   *  same scheduled call is the only maintenance tick this service has. */
  viewsPruned: number;
  /** Sync runs abandoned by a process that died, moved to `failed`. */
  syncRunsReaped: number;
  /**
   * Bookings stuck in CONFIRMING. Reported, never moved — see
   * `flagStaleConfirmations` for why guessing either way is the wrong answer.
   */
  staleConfirmations: { bookingId: string; reference: string; stuckSince: string }[];
};

/**
 * The expiry sweeper from docs/backend-architecture.md §6.1 step 5.
 *
 * Without this nothing ever leaves OPTION_HELD on its own: the provider option
 * index is unique over live bookings, so a single abandoned checkout would keep
 * that slot unbookable forever. Quotes also only expired lazily, when something
 * happened to read them.
 *
 * Abandoned sync runs are reaped here for the same reason and not because they are
 * expiries: `sync_run_in_flight_uq` is the other unique index over live rows, and a
 * run whose process stopped beating holds it against every future sync of that provider.
 *
 * Safe to run concurrently and on a schedule — every write is a compare-and-set on
 * the status that was read, so two overlapping runs cannot double-apply, and a
 * webhook that moved a booking first simply wins.
 */
export async function sweepExpiries(
  db: Database,
  provider: InventoryProvider,
  now: Date = new Date(),
): Promise<SweepResult> {
  const quotesExpired = await expireQuotes(db, now);
  const { holdsExpired, releaseFailures } = await expireHolds(db, now, provider);
  const bookingsQuoteExpired = await expireBookingsWithDeadQuotes(db, now);
  const { paymentsAbandoned } = await expireAbandonedPayments(db, now, provider, releaseFailures);
  const { viewsPruned } = await pruneListingViews(db, now);
  /*
   * Reaped through the same function `openSyncRun` calls, so the sweep and the lock can
   * never disagree about when a run has been abandoned. The sweep is the unattended half:
   * a provider whose schedule has nothing due keeps its stranded row until something asks
   * for the lock, and staff reading the history should not have to see it as in flight.
   */
  const syncRunsReaped = (await reapStaleSyncRuns(db, { now })).length;
  const staleConfirmations = await flagStaleConfirmations(db, now);

  return {
    quotesExpired,
    holdsExpired,
    bookingsQuoteExpired,
    paymentsAbandoned,
    releaseFailures,
    viewsPruned,
    syncRunsReaped,
    staleConfirmations,
  };
}

/**
 * How long a booking may sit in CONFIRMING before its process is presumed dead.
 *
 * Generous, like the sync-run reaper above: CONFIRMING is only held across a single
 * provider commit, but a slow vendor answering in minutes must not be mistaken for
 * one that never will.
 */
const STALE_CONFIRMING_MS = 15 * 60 * 1000;

/**
 * Bookings a dead process left mid-commit.
 *
 * CONFIRMING is claimed before `provider.confirmBooking` is called, so a booking
 * stuck here died during that call and we do not know whether the provider created
 * the reservation. **Nothing is moved, deliberately.** The state machine offers
 * CONFIRMED and PROVIDER_REJECTED, and both are guesses with a real cost: confirming
 * invents a charter that may not exist, and rejecting refunds a customer whose boat
 * may well be booked, losing the money and the slot. There is no `getReservation` on
 * `InventoryProvider` to settle it, so the only honest move is to make the booking
 * visible and let a human ask the provider.
 *
 * Reported on every run so it stays visible until someone resolves it; the audit
 * event is written once, so a sweep on a schedule does not fill the log.
 */
async function flagStaleConfirmations(
  db: Database,
  now: Date,
): Promise<SweepResult["staleConfirmations"]> {
  const cutoff = new Date(now.getTime() - STALE_CONFIRMING_MS);

  const stranded = await db
    .select({
      id: booking.id,
      reference: booking.reference,
      provider: booking.provider,
      providerOptionId: booking.providerOptionId,
      updatedAt: booking.updatedAt,
    })
    .from(booking)
    .where(and(eq(booking.status, "CONFIRMING"), lte(booking.updatedAt, cutoff)));

  for (const candidate of stranded) {
    const [flagged] = await db
      .select({ id: providerReservationEvent.id })
      .from(providerReservationEvent)
      .where(
        and(
          eq(providerReservationEvent.bookingId, candidate.id),
          eq(providerReservationEvent.kind, "confirm_stale"),
        ),
      )
      .limit(1);

    if (flagged) continue;

    await db.insert(providerReservationEvent).values({
      bookingId: candidate.id,
      kind: "confirm_stale",
      provider: candidate.provider,
      providerReference: candidate.providerOptionId,
      payload: {
        stuckSince: candidate.updatedAt.toISOString(),
        note: "Left in CONFIRMING by a process that died mid-commit; ask the provider whether the reservation exists.",
      },
    });
  }

  return stranded.map((candidate) => ({
    bookingId: candidate.id,
    reference: candidate.reference,
    stuckSince: candidate.updatedAt.toISOString(),
  }));
}

/** Active quotes past their expiry. Consumed ones belong to a booking and are left alone. */
async function expireQuotes(db: Database, now: Date): Promise<number> {
  const rows = await db
    .update(quote)
    .set({ status: "expired" })
    .where(and(eq(quote.status, "active"), lte(quote.expiresAt, now)))
    .returning({ id: quote.id });

  return rows.length;
}

/**
 * Bookings whose provider hold has lapsed. The option is released best-effort:
 * `hold_expires_at` has already passed, so a provider that owns its own expiry has
 * dropped it regardless, and a failed release must not leave the booking stuck in a
 * state nothing else can clear.
 */
async function expireHolds(
  db: Database,
  now: Date,
  provider: InventoryProvider,
): Promise<{ holdsExpired: number; releaseFailures: SweepResult["releaseFailures"] }> {
  const candidates = await db
    .select({
      id: booking.id,
      status: booking.status,
      providerName: booking.provider,
      providerOptionId: booking.providerOptionId,
      providerReservationId: booking.providerReservationId,
      providerReservationUuid: booking.providerReservationUuid,
    })
    .from(booking)
    .where(
      and(
        inArray(booking.status, [...HOLD_SWEEP.from]),
        isNotNull(booking.holdExpiresAt),
        lte(booking.holdExpiresAt, now),
      ),
    );

  const releaseFailures: SweepResult["releaseFailures"] = [];
  let holdsExpired = 0;

  for (const candidate of candidates) {
    // The hold was taken with whichever vendor sold the listing, and the sweep
    // walks every booking regardless of provider, so releasing it through the
    // configured adapter would call the wrong vendor with an id it never issued.
    const releaseError = await releaseOption(
      await providerByKey(provider, candidate.providerName),
      candidate,
      releaseFailures,
    );

    assertTransition(candidate.status, HOLD_SWEEP.to);

    const [updated] = await db
      .update(booking)
      .set({ status: HOLD_SWEEP.to })
      .where(and(eq(booking.id, candidate.id), eq(booking.status, candidate.status)))
      .returning({ id: booking.id });

    // Something else moved it between the read and the write; leave it alone.
    if (!updated) continue;

    holdsExpired += 1;

    await db.insert(providerReservationEvent).values({
      bookingId: candidate.id,
      kind: "option_released",
      provider: candidate.providerName,
      providerReference: candidate.providerOptionId,
      payload: releaseError ? { released: false, error: releaseError } : { released: true },
    });
  }

  return { holdsExpired, releaseFailures };
}

/**
 * Bookings still waiting on a quote that has run out. This is the only expiry path
 * for a provider with no option support, where createHold leaves the booking at
 * QUOTED with no hold to lapse.
 *
 * PAYMENT_PENDING is deliberately excluded: money may be in flight, and the Stripe
 * webhook is the authority on how that ends.
 */
async function expireBookingsWithDeadQuotes(db: Database, now: Date): Promise<number> {
  const candidates = await db
    .select({ id: booking.id, status: booking.status })
    .from(booking)
    .innerJoin(quote, eq(quote.id, booking.quoteId))
    .where(and(inArray(booking.status, [...DEAD_QUOTE_SWEEP.from]), lte(quote.expiresAt, now)));

  let expired = 0;

  for (const candidate of candidates) {
    assertTransition(candidate.status, DEAD_QUOTE_SWEEP.to);

    const [updated] = await db
      .update(booking)
      .set({ status: DEAD_QUOTE_SWEEP.to })
      .where(and(eq(booking.id, candidate.id), eq(booking.status, candidate.status)))
      .returning({ id: booking.id });

    if (updated) expired += 1;
  }

  return expired;
}

/**
 * Hands the slot back to the provider, best-effort.
 *
 * Failures are collected rather than thrown: every caller has already decided the booking is
 * over, and a provider that will not take the release must not leave a row nothing can clear.
 * Returns the message so it can be recorded on the reservation event, which is where someone
 * chasing a slot that is still blocked upstream will look.
 */
async function releaseOption(
  provider: InventoryProvider,
  candidate: {
    id: string;
    providerOptionId: string | null;
    providerReservationId: string | null;
    providerReservationUuid: string | null;
  },
  failures: SweepResult["releaseFailures"],
): Promise<string | null> {
  if (!candidate.providerOptionId) return null;

  try {
    await provider.cancelOption({
      providerReservationId: candidate.providerReservationId ?? candidate.providerOptionId,
      securityToken: candidate.providerReservationUuid ?? undefined,
    });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ bookingId: candidate.id, message });
    return message;
  }
}

/**
 * How long a booking may sit at the payment step before its checkout is presumed abandoned.
 *
 * The clock is not what waits for money, and that is why it can be this short. Everything that
 * could still arrive is excluded below by something better than a timer: a delayed method in
 * flight by its `processing` status, and a bank transfer by its invoice's own due date. What
 * the cutoff governs is the remainder — an intent that was opened and never submitted, or one
 * that was declined and never retried, where nothing is coming and the only question is how
 * long to leave the slot standing.
 *
 * Five days answers that against measured provider behaviour rather than a guess. Real NauSYS
 * options run to about six days for a distant departure and as little as twenty hours for a
 * charter leaving that week, so five puts our release at or before the vendor's in nearly every
 * case. That is the direction to err in: releasing early hands a slot back to an operator who
 * can still sell it, while releasing late leaves `booking_provider_option_uq` blocking a week
 * the operator reclaimed days ago.
 *
 * The `processing` exclusion is load-bearing for this number. It is written by the webhook's
 * `payment_intent.processing` handler, so if the Stripe endpoint is not subscribed to that
 * event the clock becomes the only thing standing between a SEPA debit and a cancelled charter,
 * and five days is not long enough for that job.
 */
const ABANDONED_PAYMENT_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * Checkouts abandoned at the payment step.
 *
 * The two sweeps above leave these states alone because money may be in flight and the
 * Stripe webhook is the authority on how that ends. True in the minutes after Pay, and the
 * reason nothing reaped them at all: a customer who opened a payment and closed the tab, or
 * whose card was declined, left a booking that no sweep would touch, holding
 * `booking_provider_option_uq` against every future booking of that slot. The operator releases
 * their own option on `optionTill`; our row outlived it indefinitely.
 *
 * Three things keep a booking out of this: money that arrived or is still arriving, an invoice
 * whose terms have not run out, and the cutoff. What is left is genuinely abandoned. A retry
 * writes the booking back to PAYMENT_PENDING, and `updated_at` moves with it, so a customer
 * working through a second card is measured from their last attempt rather than their first.
 */
async function expireAbandonedPayments(
  db: Database,
  now: Date,
  provider: InventoryProvider,
  releaseFailures: SweepResult["releaseFailures"],
): Promise<{ paymentsAbandoned: number }> {
  const cutoff = new Date(now.getTime() - ABANDONED_PAYMENT_MS);

  const candidates = await db
    .select({
      id: booking.id,
      status: booking.status,
      providerName: booking.provider,
      providerOptionId: booking.providerOptionId,
      providerReservationId: booking.providerReservationId,
      providerReservationUuid: booking.providerReservationUuid,
    })
    .from(booking)
    .where(
      and(
        inArray(booking.status, [...STALE_PAYMENT_SWEEP.from]),
        lte(booking.updatedAt, cutoff),
        /*
         * `processing` as well as `succeeded`: an async payment method that has not settled
         * yet is money on its way, and cancelling underneath it would take a customer's
         * transfer for a charter we just released.
         */
        notExists(
          db
            .select({ one: sql`1` })
            .from(payment)
            .where(
              and(
                eq(payment.bookingId, booking.id),
                inArray(payment.status, ["succeeded", "processing"]),
              ),
            ),
        ),
        // A live invoice is a customer we told to take their time, in writing.
        notExists(
          db
            .select({ one: sql`1` })
            .from(invoiceRequest)
            .where(
              and(
                eq(invoiceRequest.bookingId, booking.id),
                ne(invoiceRequest.status, "cancelled"),
                gt(invoiceRequest.dueAt, now),
              ),
            ),
        ),
      ),
    );

  let paymentsAbandoned = 0;

  for (const candidate of candidates) {
    // Same reason as the hold sweep: the option belongs to the vendor that issued
    // it, not to whichever adapter this process was configured with.
    const releaseError = await releaseOption(
      await providerByKey(provider, candidate.providerName),
      candidate,
      releaseFailures,
    );

    // Naming what actually lapsed: a booking with no option never had a hold to expire.
    const to: BookingStatus = candidate.providerOptionId
      ? STALE_PAYMENT_SWEEP.held
      : STALE_PAYMENT_SWEEP.to;

    assertTransition(candidate.status, to);

    const [updated] = await db
      .update(booking)
      .set({ status: to, cancelReason: "Payment was never completed" })
      .where(and(eq(booking.id, candidate.id), eq(booking.status, candidate.status)))
      .returning({ id: booking.id });

    // A late webhook moved it between the read and the write; it wins.
    if (!updated) continue;

    paymentsAbandoned += 1;

    await db.insert(providerReservationEvent).values({
      bookingId: candidate.id,
      kind: "option_released",
      provider: candidate.providerName,
      providerReference: candidate.providerOptionId,
      payload: releaseError
        ? { released: false, error: releaseError, reason: "payment_abandoned" }
        : { released: true, reason: "payment_abandoned" },
    });
  }

  return { paymentsAbandoned };
}
