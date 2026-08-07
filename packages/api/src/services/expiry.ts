import { booking, providerReservationEvent } from "@yacht-charter/db/schema/booking";
import { quote } from "@yacht-charter/db/schema/quote";
import { createInventoryProvider, type InventoryProvider } from "@yacht-charter/providers";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";

import type { Database } from "../context";
import {
  DEAD_QUOTE_SWEEP,
  HOLD_SWEEP,
  assertTransition,
  type BookingStatus,
} from "./booking-state";

export type SweepResult = {
  quotesExpired: number;
  holdsExpired: number;
  bookingsQuoteExpired: number;
  /** Provider releases that failed. The booking still expires; this is for ops. */
  releaseFailures: { bookingId: string; message: string }[];
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
  now: Date = new Date(),
  provider: InventoryProvider = createInventoryProvider(),
): Promise<SweepResult> {
  const quotesExpired = await expireQuotes(db, now);
  const { holdsExpired, releaseFailures } = await expireHolds(db, now, provider);
  const bookingsQuoteExpired = await expireBookingsWithDeadQuotes(db, now);

  return { quotesExpired, holdsExpired, bookingsQuoteExpired, releaseFailures };
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
        await provider.cancelOption(candidate.providerOptionId);
      } catch (error) {
        releaseError = error instanceof Error ? error.message : String(error);
        releaseFailures.push({ bookingId: candidate.id, message: releaseError });
      }
    }

    assertTransition(candidate.status as BookingStatus, HOLD_SWEEP.to);

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
    assertTransition(candidate.status as BookingStatus, DEAD_QUOTE_SWEEP.to);

    const [updated] = await db
      .update(booking)
      .set({ status: DEAD_QUOTE_SWEEP.to })
      .where(and(eq(booking.id, candidate.id), eq(booking.status, candidate.status)))
      .returning({ id: booking.id });

    if (updated) expired += 1;
  }

  return expired;
}
