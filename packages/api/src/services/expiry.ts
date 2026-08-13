import { booking, providerReservationEvent } from "@yacht-charter/db/schema/booking";
import { quote } from "@yacht-charter/db/schema/quote";
import type { InventoryProvider } from "@yacht-charter/providers";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";

import type { Database } from "../context";
import { DEAD_QUOTE_SWEEP, HOLD_SWEEP, assertTransition } from "./booking-state";
import { pruneListingViews } from "./listing-view";

export type SweepResult = {
  quotesExpired: number;
  holdsExpired: number;
  bookingsQuoteExpired: number;
  /** Provider releases that failed. The booking still expires; this is for ops. */
  releaseFailures: { bookingId: string; message: string }[];
  /** View rows dropped past their retention window — unrelated to expiry, but the
   *  same scheduled call is the only maintenance tick this service has. */
  viewsPruned: number;
};

/**
 * The expiry sweeper from docs/backend-architecture.md §6.1 step 5.
 *
 * Without this nothing ever leaves OPTION_HELD on its own: the provider option
 * index is unique over live bookings, so a single abandoned checkout would keep
 * that slot unbookable forever. Quotes also only expired lazily, when something
 * happened to read them.
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
  const { viewsPruned } = await pruneListingViews(db, now);

  return { quotesExpired, holdsExpired, bookingsQuoteExpired, releaseFailures, viewsPruned };
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
    let releaseError: string | null = null;

    if (candidate.providerOptionId) {
      try {
        await provider.cancelOption({
          providerReservationId: candidate.providerReservationId ?? candidate.providerOptionId,
          securityToken: candidate.providerReservationUuid ?? undefined,
        });
      } catch (error) {
        releaseError = error instanceof Error ? error.message : String(error);
        releaseFailures.push({ bookingId: candidate.id, message: releaseError });
      }
    }

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
