import { booking, providerReservationEvent } from "@yacht-charter/db/schema/booking";
import { createInventoryProvider, type InventoryProvider } from "@yacht-charter/providers";
import { and, eq } from "drizzle-orm";

import type { Database } from "../context";
import { canTransition, type BookingStatus } from "./booking-state";
import { awardReferralCredit } from "./loyalty";

export type ConfirmOutcome =
  | { outcome: "confirmed"; providerReservationId: string | null }
  | { outcome: "rejected"; message: string }
  | { outcome: "skipped"; reason: string };

/**
 * Commits a paid booking with the provider.
 *
 * Shared deliberately: money can arrive by card (the Stripe webhook) or by bank
 * transfer (an admin settling an invoice), and both have to reach CONFIRMED the
 * same way. Two copies of this would drift, and the branch that matters most is
 * the one nobody exercises — a provider refusing after we already hold the money.
 *
 * The provider is the final arbiter. A refusal is not swallowed: the booking goes
 * to PROVIDER_REJECTED and straight on to REFUND_PENDING so the money owed back
 * is visible to ops rather than quietly kept.
 */
export async function confirmBookingWithProvider(
  db: Database,
  bookingId: string,
  provider: InventoryProvider = createInventoryProvider(),
): Promise<ConfirmOutcome> {
  const [row] = await db.select().from(booking).where(eq(booking.id, bookingId)).limit(1);
  if (!row) return { outcome: "skipped", reason: "Unknown booking" };

  const current = row.status as BookingStatus;

  // Already done, or moved on by something else — either way, do not re-commit.
  if (current === "CONFIRMED") {
    return { outcome: "confirmed", providerReservationId: row.providerReservationId };
  }

  if (!canTransition(current, "CONFIRMING")) {
    return { outcome: "skipped", reason: `Cannot confirm a booking in ${current}` };
  }

  const [claimed] = await db
    .update(booking)
    .set({ status: "CONFIRMING" })
    .where(and(eq(booking.id, bookingId), eq(booking.status, current)))
    .returning({ id: booking.id });

  // Compare-and-set: a concurrent webhook got here first.
  if (!claimed) return { outcome: "skipped", reason: "Booking changed while confirming" };

  try {
    const reservation = await provider.confirmBooking({
      listingId: row.listingId,
      quoteId: row.quoteId,
      customer: {
        name: row.guestFullName ?? "Guest",
        email: row.guestEmail ?? "unknown@example.com",
      },
    });

    await db
      .update(booking)
      .set({
        status: "CONFIRMED",
        confirmedAt: new Date(),
        providerReservationId: reservation.providerReservationId ?? null,
        providerStatus: reservation.status,
      })
      .where(and(eq(booking.id, bookingId), eq(booking.status, "CONFIRMING")));

    await db.insert(providerReservationEvent).values({
      bookingId,
      kind: "confirm_succeeded",
      provider: row.provider,
      providerReference: reservation.providerReservationId ?? null,
      payload: reservation as unknown as Record<string, unknown>,
    });

    // "Once they complete their trip, you receive €100 credits." Its own
    // transaction, so a referral bookkeeping problem can never unwind a booking
    // that is already confirmed and paid for.
    await db.transaction(async (tx) => {
      await awardReferralCredit(tx, row.userId, bookingId);
    });

    return {
      outcome: "confirmed",
      providerReservationId: reservation.providerReservationId ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider rejected the booking";

    await db
      .update(booking)
      .set({ status: "PROVIDER_REJECTED", cancelReason: message })
      .where(and(eq(booking.id, bookingId), eq(booking.status, "CONFIRMING")));

    await db
      .update(booking)
      .set({ status: "REFUND_PENDING" })
      .where(and(eq(booking.id, bookingId), eq(booking.status, "PROVIDER_REJECTED")));

    await db.insert(providerReservationEvent).values({
      bookingId,
      kind: "confirm_failed",
      provider: row.provider,
      payload: { message },
    });

    return { outcome: "rejected", message };
  }
}
