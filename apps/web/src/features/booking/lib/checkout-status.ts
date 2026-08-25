import type { CheckoutStatus } from "../api/queries";

type Status = CheckoutStatus["status"];

/*
 * Still moving. A card booking sits in PAYMENT_PENDING until the webhook lands, then in
 * CONFIRMING while the provider commit runs, so neither state means the customer has a
 * booking yet. These are transient for card only: an invoiced booking rests in
 * PAYMENT_PENDING until the transfer arrives, which is why the caller gates on the method.
 */
const SETTLING: readonly Status[] = ["PAYMENT_PENDING", "OPTION_PENDING", "CONFIRMING"];

/*
 * Did not become a booking. REFUND_PENDING and REFUNDED are here because they are only
 * reached after a provider rejection — the money is coming back, so showing "reserved"
 * would be the opposite of what happened.
 */
const FAILED: readonly Status[] = [
  "PAYMENT_FAILED",
  "PROVIDER_REJECTED",
  "REFUND_PENDING",
  "REFUNDED",
  "CANCELLED",
  "QUOTE_EXPIRED",
  "OPTION_EXPIRED",
];

export function isSettling(status: Status | undefined): boolean {
  return status !== undefined && SETTLING.includes(status);
}

export function hasFailed(status: Status | undefined): boolean {
  return status !== undefined && FAILED.includes(status);
}

/*
 * The statuses the payment step can be opened on, as a positive list rather than a list of
 * failures - the failures are open-ended and a status missed from one reads as "pay for this".
 *
 * Mirrors `assertPayable` (packages/api/src/services/payment-guards.ts), which is
 * `canTransition(status, "PAYMENT_PENDING")`, plus PAYMENT_PENDING itself: a customer who
 * abandoned a 3-D Secure challenge resumes the intent they already have.
 *
 * Load-bearing because `checkout.createHold` answers a repeated idempotency key with the
 * earlier attempt rather than a fresh hold, so what comes back is not always a booking the
 * customer can pay for.
 */
const PAYABLE: readonly Status[] = ["QUOTED", "OPTION_HELD", "PAYMENT_PENDING", "PAYMENT_FAILED"];

export function canPay(status: Status | undefined): boolean {
  return status !== undefined && PAYABLE.includes(status);
}
