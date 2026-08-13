import { booking, providerReservationEvent } from "@yacht-charter/db/schema/booking";
import { quote } from "@yacht-charter/db/schema/quote";
import type { InventoryProvider } from "@yacht-charter/providers";
import { and, eq } from "drizzle-orm";

import type { Database } from "../context";
import { canTransition, type BookingStatus } from "./booking-state";
import { awardReferralCredit } from "./loyalty";
import { asCrewType } from "./quote";

type ConfirmRequest = Parameters<InventoryProvider["confirmBooking"]>[0];

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
  provider: InventoryProvider,
  bookingId: string,
): Promise<ConfirmOutcome> {
  // The quote is joined because committing a reservation needs the charter period
  // and the price the customer agreed to, not just the booking's own columns.
  const [found] = await db
    .select({ booking, quote })
    .from(booking)
    .innerJoin(quote, eq(quote.id, booking.quoteId))
    .where(eq(booking.id, bookingId))
    .limit(1);

  if (!found) return { outcome: "skipped", reason: "Unknown booking" };

  const row = found.booking;
  const priced = found.quote;
  const current = row.status;

  // Already done, or moved on by something else — either way, do not re-commit.
  if (current === "CONFIRMED") {
    return { outcome: "confirmed", providerReservationId: row.providerReservationId };
  }

  if (!canTransition(current, "CONFIRMING")) {
    return { outcome: "skipped", reason: `Cannot confirm a booking in ${current}` };
  }

  if (!(await claimForConfirming(db, bookingId, current))) {
    return { outcome: "skipped", reason: "Booking changed while confirming" };
  }

  const crewType = asCrewType(priced.crewType);

  try {
    const request: ConfirmRequest = {
      listingId: row.listingId,
      quoteId: priced.providerQuoteId ?? row.quoteId,
      checkIn: priced.checkIn,
      checkOut: priced.checkOut,
      guests: priced.guests,
      extras: priced.extras,
      priceSourceHash: priced.priceSourceHash,
      customer: {
        name: row.guestFullName ?? "Guest",
        email: row.guestEmail ?? "unknown@example.com",
        phone: row.guestPhone ?? undefined,
        countryCode: row.guestCountryCode ?? undefined,
      },
      // The handle the option step produced. Providers that chain their booking
      // calls need it plus the token it last returned; ours is stale the moment
      // anything about the reservation changes.
      reservation: row.providerReservationId
        ? {
            providerReservationId: row.providerReservationId,
            providerOptionId: row.providerOptionId ?? undefined,
            securityToken: row.providerReservationUuid ?? undefined,
          }
        : undefined,
    };

    if (crewType) request.crewType = crewType;

    const reservation = await provider.confirmBooking(request);

    await markConfirmed(db, bookingId, row.provider, row.userId, reservation);

    return {
      outcome: "confirmed",
      providerReservationId: reservation.providerReservationId ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider rejected the booking";
    await markRejected(db, bookingId, row.provider, message);

    return { outcome: "rejected", message };
  }
}

/**
 * Compare-and-set on the status: whoever wins moves the booking to CONFIRMING and
 * owns the provider call. A concurrent webhook that got here first loses here
 * rather than by committing the same booking twice.
 */
async function claimForConfirming(
  db: Database,
  bookingId: string,
  from: BookingStatus,
): Promise<boolean> {
  const [claimed] = await db
    .update(booking)
    .set({ status: "CONFIRMING" })
    .where(and(eq(booking.id, bookingId), eq(booking.status, from)))
    .returning({ id: booking.id });

  return Boolean(claimed);
}

async function markConfirmed(
  db: Database,
  bookingId: string,
  provider: string,
  userId: string,
  reservation: Awaited<ReturnType<InventoryProvider["confirmBooking"]>>,
): Promise<void> {
  const changes: Partial<typeof booking.$inferInsert> = {
    status: "CONFIRMED",
    confirmedAt: new Date(),
    providerReservationId: reservation.providerReservationId ?? null,
    providerStatus: reservation.status,
  };

  // Only when the provider issued a new one: a call that returns no token has not
  // rotated it, and overwriting with null would strand the reservation.
  if (reservation.securityToken) changes.providerReservationUuid = reservation.securityToken;

  await db
    .update(booking)
    .set(changes)
    .where(and(eq(booking.id, bookingId), eq(booking.status, "CONFIRMING")));

  await db.insert(providerReservationEvent).values({
    bookingId,
    kind: "confirm_succeeded",
    provider,
    providerReference: reservation.providerReservationId ?? null,
    payload: reservation,
  });

  // "Once they complete their trip, you receive €100 credits." Its own
  // transaction, so a referral bookkeeping problem can never unwind a booking
  // that is already confirmed and paid for.
  await db.transaction(async (tx) => {
    await awardReferralCredit(tx, userId, bookingId);
  });
}

/**
 * Straight on to REFUND_PENDING rather than stopping at PROVIDER_REJECTED: we
 * are holding money for a booking the provider refused, and that debt has to be
 * visible to ops rather than quietly kept.
 */
async function markRejected(
  db: Database,
  bookingId: string,
  provider: string,
  message: string,
): Promise<void> {
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
    provider,
    payload: { message },
  });
}
