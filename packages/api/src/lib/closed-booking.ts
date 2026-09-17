/**
 * Bookings that are over, one way or another: nothing is owed on them and no hold is running.
 *
 * Money already taken is returned through the refund queue, so an "outstanding" figure, an amount
 * due at the marina or a hold deadline on one of these only invites someone to chase, or pay, a
 * sum nobody will collect. Shared by the customer's and the staff's screens so they agree.
 */
const CLOSED_STATUSES: ReadonlySet<string> = new Set([
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
  "QUOTE_EXPIRED",
  "OPTION_EXPIRED",
  "PROVIDER_REJECTED",
]);

export function isClosedBooking(status: string): boolean {
  return CLOSED_STATUSES.has(status);
}
