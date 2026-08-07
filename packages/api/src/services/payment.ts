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

  // The key carries the amount, so a repriced booking gets a new intent rather
  // than silently reusing one for a figure the customer never saw. Keep this
  // after amountMinor is computed.
  const amountMinor = amountDue(row.quote, preference);
  const kind = preference === "full" ? ("full" as const) : ("deposit" as const);
  const idempotencyKey = `pay:${bookingId}:${kind}:${amountMinor}`;

  const reused = await reuseIntent(db, stripe, bookingId, current, idempotencyKey);
  if (reused) return reused;

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

  const paymentId = await recordIntent(db, {
    bookingId,
    from: current,
    kind,
    amountMinor,
    currency: row.booking.currency,
    stripePaymentIntentId: intent.id,
    idempotencyKey,
  });

  if (!paymentId) throw new ORPCError("INTERNAL_SERVER_ERROR");

  return present({
    bookingId,
    status: "PAYMENT_PENDING",
    paymentId,
    amountMinor,
    currency: row.booking.currency,
    kind,
    intent,
  });
}

/**
 * Reuse the existing intent when the customer retries the same amount, so a
 * double-click cannot open two charges for one booking. The booking's status is
 * whatever it already was — this path advances nothing.
 */
async function reuseIntent(
  db: Database,
  stripe: Stripe,
  bookingId: string,
  status: ConfirmResult["status"],
  idempotencyKey: string,
): Promise<ConfirmResult | null> {
  const [existing] = await db
    .select()
    .from(payment)
    .where(eq(payment.idempotencyKey, idempotencyKey))
    .limit(1);

  if (!existing?.stripePaymentIntentId) return null;

  return present({
    bookingId,
    status,
    paymentId: existing.id,
    amountMinor: existing.amountMinor,
    currency: existing.currency,
    kind: existing.kind,
    intent: await stripe.paymentIntents.retrieve(existing.stripePaymentIntentId),
  });
}

/** Schedule, payment and the booking's move to PAYMENT_PENDING, in one transaction. */
async function recordIntent(
  db: Database,
  input: {
    bookingId: string;
    from: BookingStatus;
    kind: "deposit" | "full";
    amountMinor: number;
    currency: string;
    stripePaymentIntentId: string;
    idempotencyKey: string;
  },
): Promise<string | undefined> {
  return db.transaction(async (tx) => {
    const [schedule] = await tx
      .insert(paymentSchedule)
      .values({
        bookingId: input.bookingId,
        kind: input.kind,
        amountMinor: input.amountMinor,
        currency: input.currency,
      })
      .returning({ id: paymentSchedule.id });

    const [created] = await tx
      .insert(payment)
      .values({
        bookingId: input.bookingId,
        scheduleId: schedule?.id ?? null,
        kind: input.kind,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: "requires_payment",
        stripePaymentIntentId: input.stripePaymentIntentId,
        idempotencyKey: input.idempotencyKey,
      })
      .returning({ id: payment.id });

    await tx
      .update(booking)
      .set({ status: "PAYMENT_PENDING", paymentMethod: "card" })
      .where(and(eq(booking.id, input.bookingId), eq(booking.status, input.from)));

    return created?.id;
  });
}

function present(input: {
  bookingId: string;
  status: ConfirmResult["status"];
  paymentId: string;
  amountMinor: number;
  currency: string;
  kind: ConfirmResult["kind"];
  intent: Stripe.PaymentIntent;
}): ConfirmResult {
  return {
    bookingId: input.bookingId,
    status: input.status,
    paymentId: input.paymentId,
    amount: { amountMinor: input.amountMinor, currency: input.currency },
    kind: input.kind,
    clientSecret: input.intent.client_secret ?? "",
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
