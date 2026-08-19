import {
  booking,
  payment,
  paymentRefund,
  paymentSchedule,
  providerWebhookEvent,
} from "@yacht-charter/db/schema/booking";
import { env } from "@yacht-charter/env/server";
import type { InventoryProvider } from "@yacht-charter/providers";
import { and, eq, isNull } from "drizzle-orm";
import type Stripe from "stripe";
import { z } from "zod";

import type { Database } from "../context";
import { providerByKey } from "./provider-routing";
import { confirmBookingWithProvider } from "./booking-confirm";
import { canTransition } from "./booking-state";
import { stripeClient } from "./payment";
import { announcePaymentReceived } from "./payment-receipt";
import { refundBooking, settlePayment, settleWhenFullyRefunded } from "./refund";

/**
 * Stripe sends the bare id unless a caller expanded the intent into an object, so both
 * shapes are accepted and collapse to the id. Null on an event that carries neither.
 */
const paymentIntentRefSchema = z.union([
  z.string().min(1),
  z.object({ id: z.string().min(1) }).transform((intent) => intent.id),
]);

export type WebhookOutcome =
  | { handled: true; eventId: string; duplicate: boolean; note?: string }
  | { handled: false; reason: string };

/**
 * Verifies and processes one Stripe event.
 *
 * Stripe is the authority on whether money moved, so this — not the browser — is
 * what advances a booking to CONFIRMED. Redelivery is expected, so the event id is
 * recorded first and a repeat is acknowledged without being applied twice (§6.2).
 */
export async function handleStripeWebhook(
  db: Database,
  provider: InventoryProvider,
  rawBody: string,
  signature: string | null,
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

  const [inserted] = await db
    .insert(providerWebhookEvent)
    .values({
      source: "stripe",
      externalEventId: event.id,
      eventType: event.type,
      payload: event,
    })
    .onConflictDoNothing()
    .returning({ id: providerWebhookEvent.id });

  // The unique (source, external_event_id) index already held this one; whether
  // that means "done" depends on how far the earlier attempt got.
  const recorded = inserted ?? (await claimUnprocessed(db, event.id));

  if (!recorded) return { handled: true, eventId: event.id, duplicate: true };

  let note: string | undefined;

  try {
    if (event.type === "payment_intent.succeeded") {
      note = await onSucceeded(db, provider, event.data.object);
    } else if (event.type === "payment_intent.processing") {
      await onProcessing(db, event.data.object);
    } else if (event.type === "payment_intent.payment_failed") {
      await onFailed(db, event.data.object);
    } else if (event.type === "refund.updated") {
      await onRefundUpdated(db, event.data.object);
    } else if (event.type === "charge.dispute.created") {
      note = await onDisputeOpened(db, event.data.object);
    } else if (event.type === "charge.dispute.closed") {
      note = await onDisputeClosed(db, event.data.object);
    }

    await db
      .update(providerWebhookEvent)
      .set({ processedAt: new Date(), error: note ?? null })
      .where(eq(providerWebhookEvent.id, recorded.id));
  } catch (error) {
    await db
      .update(providerWebhookEvent)
      .set({ error: error instanceof Error ? error.message : String(error) })
      .where(eq(providerWebhookEvent.id, recorded.id));
    throw error;
  }

  return { handled: true, eventId: event.id, duplicate: false, note };
}

/**
 * A redelivery of an event we recorded but never finished, ready to be applied again.
 * Null when the earlier attempt ran to completion and there is nothing left to do.
 *
 * Dedupe has to key on *processed*, not *seen*. The row goes in before the handlers
 * run, so a crash or a failed provider call in between leaves it recorded with no
 * `processed_at` — and treating that as a duplicate turns Stripe's retry, the very
 * thing that exists to save us, into a 200 that drops the event for good. The
 * handlers are written to be re-appliable: the payment updates are idempotent, and
 * `confirmBookingWithProvider` refuses any booking that is no longer confirmable.
 */
async function claimUnprocessed(db: Database, eventId: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: providerWebhookEvent.id, processedAt: providerWebhookEvent.processedAt })
    .from(providerWebhookEvent)
    .where(
      and(
        eq(providerWebhookEvent.source, "stripe"),
        eq(providerWebhookEvent.externalEventId, eventId),
      ),
    )
    .limit(1);

  if (!row || row.processedAt) return null;

  return { id: row.id };
}

/** Returns a note when the event was handled but the outcome is one ops should see. */
async function onSucceeded(
  db: Database,
  provider: InventoryProvider,
  intent: Stripe.PaymentIntent,
): Promise<string | undefined> {
  const row = await findByIntent(db, intent.id);
  if (!row) return undefined;

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

  // Before the commit, so the receipt arrives ahead of the confirmation it pays for. Both
  // are best-effort; neither can hold up the provider call that turns money into a charter.
  await announcePaymentReceived(db, row.payment.id, "card");

  // Money is in; the provider is the final arbiter of the reservation itself.
  // Shared with admin invoice settlement so both routes to CONFIRMED behave alike.
  //
  // Resolved from the booking rather than from the configured adapter: the webhook
  // answers for whichever vendor sold the charter, and confirming a paid booking
  // with the wrong one sends a reservation id that vendor never issued while the
  // customer's money is already taken.
  const outcome = await confirmBookingWithProvider(
    db,
    await providerByKey(provider, row.booking.provider),
    row.booking.id,
  );

  if (outcome.outcome !== "rejected") return undefined;

  // We are holding the customer's money for a charter that will not happen, and
  // nobody has to ask us to give it back. Not guarded, so a refund that fails
  // throws and the event stays unprocessed for Stripe to redeliver.
  await refundBooking(db, row.booking.id, { reason: outcome.message });

  /*
   * Returned rather than thrown. A provider refusing is an outcome this handler
   * exists to deal with, and it dealt with it: the booking is REFUND_PENDING and
   * the money is on its way back. Throwing answered Stripe with a 500, which marked
   * a correctly handled event as a failed delivery and made real processing faults
   * indistinguishable from it in the Dashboard. The reasoning lives in
   * `booking.cancel_reason` and a `confirm_failed` reservation event either way.
   */
  return outcome.message;
}

/**
 * A customer has charged back.
 *
 * The booking is deliberately left alone. Stripe has pulled the money, but a dispute
 * can still be won, and the provider is holding a boat either way — cancelling here
 * would give away a charter that may still be paid for, while doing nothing at all
 * leaves a CONFIRMED booking nobody knows is contested. So it is recorded against the
 * payment and returned as a note, which is the signal ops acts on.
 */
async function onDisputeOpened(db: Database, dispute: Stripe.Dispute): Promise<string | undefined> {
  const row = await paymentForDispute(db, dispute);
  if (!row) return undefined;

  await db
    .update(payment)
    .set({ disputedAt: new Date(), disputeStatus: dispute.status })
    .where(and(eq(payment.id, row.payment.id), isNull(payment.disputedAt)));

  return `Booking ${row.booking.reference} disputed (${dispute.reason}); ${dispute.status}`;
}

/**
 * How the dispute ended. `disputedAt` is left set even on a win: that this booking was
 * once contested is history worth keeping, and `disputeStatus` is what says how it went.
 */
async function onDisputeClosed(db: Database, dispute: Stripe.Dispute): Promise<string | undefined> {
  const row = await paymentForDispute(db, dispute);
  if (!row) return undefined;

  await db
    .update(payment)
    .set({ disputeStatus: dispute.status })
    .where(eq(payment.id, row.payment.id));

  // Lost means the money is gone for good, which is a different conversation from a
  // refund we chose to make — the charter may still be on the provider's books.
  return `Booking ${row.booking.reference} dispute ${dispute.status}`;
}

/** Disputes carry the intent as an id, or as the expanded object when someone asked for it. */
async function paymentForDispute(db: Database, dispute: Stripe.Dispute) {
  const intentId = paymentIntentRefSchema.safeParse(dispute.payment_intent).data;

  return intentId ? findByIntent(db, intentId) : null;
}

/**
 * Closes out a refund Stripe took time to settle — the card path usually answers
 * `succeeded` inline, but bank debits and some wallets do not.
 */
/**
 * Closes out a refund we opened. Keyed on the Stripe refund id, not the payment: a booking can
 * be returned in parts, and Stripe redelivers this event, so the payment alone cannot say which
 * of several refunds an update is about.
 */
async function onRefundUpdated(db: Database, refund: Stripe.Refund): Promise<void> {
  const intentId = paymentIntentRefSchema.safeParse(refund.payment_intent).data;
  if (!intentId) return;

  const row = await findByIntent(db, intentId);
  if (!row) return;

  const [attempt] = await db
    .select()
    .from(paymentRefund)
    .where(eq(paymentRefund.stripeRefundId, refund.id))
    .limit(1);

  // A refund opened in the Stripe dashboard rather than by us. Recorded rather than ignored,
  // so the money shows as returned instead of leaving the booking owing it forever.
  const attemptId =
    attempt?.id ??
    (
      await db
        .insert(paymentRefund)
        .values({
          paymentId: row.payment.id,
          amountMinor: refund.amount,
          currency: row.payment.currency,
          status: "pending",
          stripeRefundId: refund.id,
          reason: "Opened outside the app",
        })
        .returning({ id: paymentRefund.id })
    )[0]?.id;

  if (!attemptId) return;

  if (refund.status === "succeeded") {
    await db.transaction(async (tx) => {
      await tx
        .update(paymentRefund)
        .set({ status: "succeeded", settledAt: new Date() })
        .where(and(eq(paymentRefund.id, attemptId), isNull(paymentRefund.settledAt)));

      await settlePayment(tx, row.payment);
    });

    await settleWhenFullyRefunded(db, row.booking.id);
    return;
  }

  if (refund.status === "failed" || refund.status === "canceled") {
    const failureReason = refund.failure_reason ?? `Refund ${refund.status}`;

    // Left at REFUND_PENDING deliberately: the debt is still real, and this is
    // what an admin retrying admin.booking.refund needs to see. Marking the attempt
    // failed is what puts the amount back on the pile for that retry to find.
    await db
      .update(paymentRefund)
      .set({ status: refund.status, failureReason })
      .where(eq(paymentRefund.id, attemptId));

    await db.update(payment).set({ failureReason }).where(eq(payment.id, row.payment.id));
  }
}

/**
 * A delayed payment method has been submitted and is on its way.
 *
 * Nothing about the booking changes: no money has arrived, PAYMENT_PENDING is already where
 * it is, and `payment_intent.succeeded` remains the event that commits the charter. What
 * changes is that the payment row stops looking untouched.
 *
 * That distinction is load-bearing. A card resolves in seconds, but SEPA debit and the other
 * delayed methods behind `automatic_payment_methods` clear over days, and everything that asks
 * "is money still coming?" reads this column: `expireAbandonedPayments` refuses to reap a
 * booking whose payment is processing. Without this handler such a payment sat at
 * `requires_payment`, indistinguishable from a checkout nobody ever submitted, and the sweep's
 * exclusion for it could never match anything.
 *
 * Only from `requires_payment`, so a redelivery arriving after the money landed cannot walk a
 * succeeded payment backwards.
 */
async function onProcessing(db: Database, intent: Stripe.PaymentIntent): Promise<void> {
  const row = await findByIntent(db, intent.id);
  if (!row) return;

  await db
    .update(payment)
    .set({ status: "processing" })
    .where(and(eq(payment.id, row.payment.id), eq(payment.status, "requires_payment")));
}

async function onFailed(db: Database, intent: Stripe.PaymentIntent): Promise<void> {
  const row = await findByIntent(db, intent.id);
  if (!row) return;

  await db
    .update(payment)
    .set({
      status: "failed",
      failureReason: intent.last_payment_error?.message ?? "Payment failed",
    })
    .where(eq(payment.id, row.payment.id));

  const current = row.booking.status;
  if (!canTransition(current, "PAYMENT_FAILED")) return;

  // Stays retryable: the customer can try another card until the quote or the
  // provider hold expires.
  await db
    .update(booking)
    .set({ status: "PAYMENT_FAILED" })
    .where(and(eq(booking.id, row.booking.id), eq(booking.status, current)));
}

async function findByIntent(db: Database, intentId: string) {
  const [row] = await db
    .select({ payment, booking })
    .from(payment)
    .innerJoin(booking, eq(booking.id, payment.bookingId))
    .where(eq(payment.stripePaymentIntentId, intentId))
    .limit(1);

  return row ?? null;
}
