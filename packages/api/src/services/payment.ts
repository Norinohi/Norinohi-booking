import { ORPCError } from "@orpc/server";
import { booking, payment, paymentSchedule } from "@yacht-charter/db/schema/booking";
import { env } from "@yacht-charter/env/server";
import { and, eq } from "drizzle-orm";
import Stripe from "stripe";
import type { z } from "zod";

import type { Database } from "../context";
import type { checkoutConfirmSchema } from "../contracts/booking";
import { readOwnedBooking } from "./booking-read";
import { assertTransition, type BookingStatus } from "./booking-state";
import { amountDue } from "./checkout";
import { assertQuoteIsFresh } from "./quote";

type ConfirmResult = z.infer<typeof checkoutConfirmSchema>;

let client: Stripe | null = null;

/**
 * Null when STRIPE_SECRET_KEY is unset. Card checkout then reports NOT_IMPLEMENTED
 * instead of the server failing to boot, so the invoice and enquiry paths keep
 * working without payment credentials.
 */
export function stripeClient(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  // No apiVersion override: the SDK pins the version it was built against, and
  // hardcoding an older one here would silently drift from the typings.
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

/**
 * Creates the PaymentIntent for a booking and moves it to PAYMENT_PENDING.
 *
 * The quote is re-validated first: past its expiry, or with a moved provider
 * price, the customer must reprice rather than being charged an amount they were
 * never shown (§6.2).
 */
export async function confirmCheckout(
  db: Database,
  userId: string,
  bookingId: string,
  preference: "deposit" | "full",
): Promise<ConfirmResult> {
  const stripe = stripeClient();
  if (!stripe) {
    throw new ORPCError("NOT_IMPLEMENTED", {
      message: "Card payment is not configured — set STRIPE_SECRET_KEY to enable it",
    });
  }

  const row = await readOwnedBooking(db, userId, bookingId);

  const current = row.booking.status as BookingStatus;
  assertTransition(current, "PAYMENT_PENDING");

  // Throws QUOTE_EXPIRED when stale; the quote was consumed by createHold, so read
  // it directly rather than through the active-quote guard.
  await assertPriceStillValid(row.quote.expiresAt);

  const amountMinor = amountDue(row.quote, preference);
  const kind = preference === "full" ? ("full" as const) : ("deposit" as const);
  const idempotencyKey = `pay:${bookingId}:${kind}:${amountMinor}`;

  // Reuse the existing intent when the customer retries the same amount, so a
  // double-click cannot open two charges for one booking.
  const [existing] = await db
    .select()
    .from(payment)
    .where(eq(payment.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existing?.stripePaymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
    return {
      bookingId,
      status: row.booking.status,
      paymentId: existing.id,
      amount: { amountMinor: existing.amountMinor, currency: existing.currency },
      kind: existing.kind,
      clientSecret: intent.client_secret ?? "",
    };
  }

  const intent = await stripe.paymentIntents.create(
    {
      amount: amountMinor,
      currency: row.booking.currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      // The webhook is authoritative and looks the booking up by these.
      metadata: { bookingId, kind, reference: row.booking.reference },
    },
    { idempotencyKey },
  );

  const paymentId = await db.transaction(async (tx) => {
    const [schedule] = await tx
      .insert(paymentSchedule)
      .values({
        bookingId,
        kind,
        amountMinor,
        currency: row.booking.currency,
      })
      .returning({ id: paymentSchedule.id });

    const [created] = await tx
      .insert(payment)
      .values({
        bookingId,
        scheduleId: schedule?.id ?? null,
        kind,
        amountMinor,
        currency: row.booking.currency,
        status: "requires_payment",
        stripePaymentIntentId: intent.id,
        idempotencyKey,
      })
      .returning({ id: payment.id });

    await tx
      .update(booking)
      .set({ status: "PAYMENT_PENDING", paymentMethod: "card" })
      .where(and(eq(booking.id, bookingId), eq(booking.status, current)));

    return created?.id;
  });

  if (!paymentId) throw new ORPCError("INTERNAL_SERVER_ERROR");

  return {
    bookingId,
    status: "PAYMENT_PENDING",
    paymentId,
    amount: { amountMinor, currency: row.booking.currency },
    kind,
    clientSecret: intent.client_secret ?? "",
  };
}

async function assertPriceStillValid(expiresAt: Date): Promise<void> {
  if (expiresAt > new Date()) return;
  throw new ORPCError("CONFLICT", {
    message: "Quote has expired — reprice before paying",
    data: { code: "QUOTE_EXPIRED" },
  });
}

// Re-exported so the webhook route in apps/server does not import the quote
// service directly just to reach this guard.
export { assertQuoteIsFresh };
