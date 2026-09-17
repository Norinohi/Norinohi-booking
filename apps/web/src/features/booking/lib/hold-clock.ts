import { canPay } from "./checkout-status";

const MINUTE = 60_000;

export type HoldRemaining = { expired: true } | { expired: false; hours: number; minutes: number };

/**
 * What is left of a provider option, in whole hours and minutes.
 *
 * Hours rather than days because a vendor option runs for a day or two, and "47 h 12 min" reads
 * as a deadline where "1 day 23 h" reads as a duration. Minutes round up, so the last minute of a
 * hold says "0 h 1 min" instead of a zero that is not yet expired.
 */
export function holdRemaining(expiresAt: string, now: number): HoldRemaining {
  const ms = Date.parse(expiresAt) - now;
  if (!(ms > 0)) return { expired: true };
  const totalMinutes = Math.ceil(ms / MINUTE);
  return { expired: false, hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/**
 * The provider deadline worth counting down on a booking record, or null.
 *
 * Read off the booking rather than the `createHold` response, so a reload or another device
 * shows the same clock. Only while the booking can still be paid for: once it is confirmed,
 * cancelled or failed, `holdExpiresAt` is history and a countdown to it would be noise.
 */
export function pendingHoldDeadline(booking: {
  status: Parameters<typeof canPay>[0];
  holdExpiresAt: string | null;
}): string | null {
  return canPay(booking.status) ? booking.holdExpiresAt : null;
}
