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
