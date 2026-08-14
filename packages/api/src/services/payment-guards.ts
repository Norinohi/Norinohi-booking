import { ORPCError } from "@orpc/server";
import type Stripe from "stripe";

import { canTransition, type BookingStatus } from "./booking-state";

/*
 * The two checks `confirmCheckout` runs before it will open or resume a charge.
 *
 * Kept apart from payment.ts because that module builds the Stripe client from
 * validated env at import time, and these are pure decisions about state that
 * should be testable without a configured server.
 */

/**
 * Which Stripe states a client secret may still be handed back for.
 *
 * Money already taken must not come back as something to pay again: the webhook
 * owns what happens after a charge succeeds, and re-presenting the intent would
 * invite a second one for the same booking.
 */
export function assertIntentIsResumable(status: Stripe.PaymentIntent.Status): void {
  if (status === "succeeded" || status === "processing") {
    throw new ORPCError("CONFLICT", {
      message: "This payment has already gone through",
      data: { code: "ALREADY_PAID" },
    });
  }

  /*
   * Nothing here cancels intents, so this is Stripe's own lifecycle expiring one.
   * It cannot be confirmed, and a fresh create would reuse the same
   * Idempotency-Key and hand the cancelled intent straight back, so the booking
   * has to be repriced rather than silently retried.
   */
  if (status === "canceled") {
    throw new ORPCError("CONFLICT", {
      message: "This payment expired — reprice before paying",
      data: { code: "QUOTE_EXPIRED" },
    });
  }
}

/**
 * Whether the provider is still holding the slot we are about to charge for.
 *
 * `HOLD_SWEEP` deliberately leaves PAYMENT_PENDING alone, because money may be in
 * flight and the webhook owns that. The consequence is that a lapsed hold is not
 * swept while a checkout sits on it, so without this the customer is charged for a
 * slot the provider has already released: the commit then fails, and we refund
 * money we should never have taken.
 *
 * Null means the provider has no option support and there is no hold to lapse.
 */
export function assertHoldStillValid(holdExpiresAt: Date | null, now: Date): void {
  if (!holdExpiresAt || holdExpiresAt > now) return;

  throw new ORPCError("CONFLICT", {
    message: "The hold on this slot has expired — reprice before paying",
    data: { code: "QUOTE_EXPIRED" },
  });
}

/**
 * Whether a payment may be started at all. Separate from the reuse path so a
 * booking that already has an intent is resumed rather than refused, and mapped to
 * a CONFLICT because an unmapped InvalidTransitionError surfaces as a 500.
 */
export function assertPayable(current: BookingStatus): void {
  if (canTransition(current, "PAYMENT_PENDING")) return;

  throw new ORPCError("CONFLICT", {
    message: `A booking in ${current} cannot be paid for`,
    data: { code: "NOT_PAYABLE" },
  });
}
