import {
  booking,
  payment,
  paymentSchedule,
  providerWebhookEvent,
} from "@yacht-charter/db/schema/booking";
import { env } from "@yacht-charter/env/server";
import { createInventoryProvider, type InventoryProvider } from "@yacht-charter/providers";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";

import type { Database } from "../context";
import { confirmBookingWithProvider } from "./booking-confirm";
import { canTransition, type BookingStatus } from "./booking-state";
import { stripeClient } from "./payment";

type Db = Database;

export type WebhookOutcome =
  | { handled: true; eventId: string; duplicate: boolean }
  | { handled: false; reason: string };

/**
 * Verifies and processes one Stripe event.
 *
 * Stripe is the authority on whether money moved, so this — not the browser — is
 * what advances a booking to CONFIRMED. Redelivery is expected, so the event id is
 * recorded first and a repeat is acknowledged without being applied twice (§6.2).
 */
export async function handleStripeWebhook(
  db: Db,
  rawBody: string,
  signature: string | null,
  // Injectable for tests; apps/server is transport-only and does not depend on
  // the providers package.
  provider: InventoryProvider = createInventoryProvider(),
): Promise<WebhookOutcome> {
  const stripe = stripeClient();
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return { handled: false, reason: "Stripe is not configured" };
  }

  if (!signature) return { handled: false, reason: "Missing stripe-signature header" };

  let event: Stripe.Event;
  try {
    // Must run against the raw body — any JSON round-trip breaks the signature.
    event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return {
      handled: false,
      reason: error instanceof Error ? error.message : "Signature verification failed",
    };
  }

  const [recorded] = await db
    .insert(providerWebhookEvent)
    .values({
      source: "stripe",
      externalEventId: event.id,
      eventType: event.type,
      payload: event as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning({ id: providerWebhookEvent.id });

  // The unique (source, external_event_id) index already held this one.
  if (!recorded) return { handled: true, eventId: event.id, duplicate: true };

  try {
    if (event.type === "payment_intent.succeeded") {
      await onSucceeded(db, provider, event.data.object);
    } else if (event.type === "payment_intent.payment_failed") {
      await onFailed(db, event.data.object);
    }

    await db
      .update(providerWebhookEvent)
      .set({ processedAt: new Date() })
      .where(eq(providerWebhookEvent.id, recorded.id));
  } catch (error) {
    await db
      .update(providerWebhookEvent)
      .set({ error: error instanceof Error ? error.message : String(error) })
      .where(eq(providerWebhookEvent.id, recorded.id));
    throw error;
  }

  return { handled: true, eventId: event.id, duplicate: false };
}

async function onSucceeded(
  db: Db,
  provider: InventoryProvider,
  intent: Stripe.PaymentIntent,
): Promise<void> {
  const row = await findByIntent(db, intent.id);
  if (!row) return;

  await db.transaction(async (tx) => {
    await tx
      .update(payment)
      .set({ status: "succeeded", paidAt: new Date() })
      .where(eq(payment.id, row.payment.id));

    if (row.payment.scheduleId) {
      await tx
        .update(paymentSchedule)
        .set({ status: "paid" })
        .where(eq(paymentSchedule.id, row.payment.scheduleId));
    }
  });

  // Money is in; the provider is the final arbiter of the reservation itself.
  // Shared with admin invoice settlement so both routes to CONFIRMED behave alike.
  const outcome = await confirmBookingWithProvider(db, row.booking.id, provider);

  // Surfaces to the webhook caller, which records it against the event row.
  if (outcome.outcome === "rejected") throw new Error(outcome.message);
}

async function onFailed(db: Db, intent: Stripe.PaymentIntent): Promise<void> {
  const row = await findByIntent(db, intent.id);
  if (!row) return;

  await db
    .update(payment)
    .set({
      status: "failed",
      failureReason: intent.last_payment_error?.message ?? "Payment failed",
    })
    .where(eq(payment.id, row.payment.id));

  const current = row.booking.status as BookingStatus;
  if (!canTransition(current, "PAYMENT_FAILED")) return;

  // Stays retryable: the customer can try another card until the quote or the
  // provider hold expires.
  await db
    .update(booking)
    .set({ status: "PAYMENT_FAILED" })
    .where(and(eq(booking.id, row.booking.id), eq(booking.status, current)));
}

async function findByIntent(db: Db, intentId: string) {
  const [row] = await db
    .select({ payment, booking })
    .from(payment)
    .innerJoin(booking, eq(booking.id, payment.bookingId))
    .where(eq(payment.stripePaymentIntentId, intentId))
    .limit(1);

  return row ?? null;
}
