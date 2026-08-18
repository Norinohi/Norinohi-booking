import type { quote } from "@yacht-charter/db/schema/quote";

import { type BookingStatus, canTransition } from "./booking-state";

/*
 * What a booking owes, as arithmetic over a frozen quote.
 *
 * Kept apart from checkout.ts, which sends mail and therefore loads the server env: these two
 * functions decide what a customer is charged, and that has to be checkable without a configured
 * mailer. Same reasoning as refund-plan.ts against refund.ts.
 */

/**
 * What a booking still owes: everything collectable up front, less what has actually
 * arrived.
 *
 * `paidMinor` must count settled money only — a refunded payment has left again and a
 * pending one has not landed. Both callers filter on `succeeded` in the query that reads
 * them, which is where that belongs.
 *
 * `amountDue` has already dropped the pay-at-check-in lines, which the base collects in
 * person and we must never charge.
 *
 * One definition on purpose: `checkout.payBalance` charges this and `booking.list`/`get`
 * report it, and a screen that advertises one figure while the server takes another is
 * worse than no screen.
 */
export function outstandingMinor(priced: typeof quote.$inferSelect, paidMinor: number): number {
  return Math.max(amountDue(priced, "full") - paidMinor, 0);
}

/**
 * What to charge now. `deposit` follows the quote's payment policy; `full` is the
 * customer choosing to prepay everything. Lines marked pay-at-check-in are settled
 * with the base and are never part of either figure.
 */
export function amountDue(
  priced: typeof quote.$inferSelect,
  preference: "deposit" | "full",
): number {
  const atCheckIn = priced.lines
    .filter((line) => line.payWhen === "at_check_in")
    .reduce((total, line) => total + line.amountMinor, 0);

  const payableNow = Math.max(priced.totalMinor - atCheckIn, 0);

  if (preference === "full") return payableNow;
  return Math.min(priced.depositMinor, payableNow);
}

/**
 * What a booking can be charged right now, and the single figure every Pay affordance
 * answers to.
 *
 * Two different questions wear one name because the screens only ever ask one: is there
 * money to take, and how much. Before the charter exists, taking money means meeting the
 * quote's prepayment, and what has already arrived comes off it — a customer who paid a
 * deposit by transfer and came back to the card owes the difference, not the whole thing
 * again. Once it is CONFIRMED, it means the rest.
 *
 * Zero for anything that cannot be paid at all, which is what hides the button: a booking
 * that is cancelled, refunded or mid-commit has nothing to collect, and one whose quote or
 * provider hold has run out has to be repriced first.
 *
 * Those last two are the same checks `payment.confirmCheckout` makes before it will open a
 * charge, repeated here on purpose. They have to agree: a screen that offers Pay on a lapsed
 * quote sends the customer through the card form to reach an error the button could have
 * spared them, and that is exactly what a "finish your payment" affordance must not do.
 *
 * Both are skipped once the booking is CONFIRMED, for the same reason `confirmCheckout` skips
 * them: the quote and the hold behind a paid charter have long since lapsed in the ordinary
 * course of things, and neither says anything about whether the balance can be collected.
 *
 * Named apart from `pricing.payableNowMinor`, which is the unrelated question of which quote
 * lines we collect at all rather than what this booking owes today.
 */
export function payableNowFor(
  priced: typeof quote.$inferSelect,
  paidMinor: number,
  row: { status: BookingStatus; holdExpiresAt: Date | null },
  now: Date = new Date(),
): number {
  if (row.status === "CONFIRMED") return outstandingMinor(priced, paidMinor);
  if (!canStartPayment(row.status)) return 0;

  if (priced.expiresAt <= now) return 0;
  // Null where the provider grants no option, so there is no hold to have lapsed.
  if (row.holdExpiresAt && row.holdExpiresAt <= now) return 0;

  return Math.max(amountDue(priced, priced.paymentPolicy.mode) - paidMinor, 0);
}

/**
 * Whether a checkout may still be resumed for this booking.
 *
 * PAYMENT_PENDING is not a legal move to itself, so the transition table alone would
 * refuse the one case this exists for: a customer who opened a payment, abandoned it and
 * came back. `payment.confirmCheckout` resumes such a booking through its existing intent.
 */
function canStartPayment(status: BookingStatus): boolean {
  return status === "PAYMENT_PENDING" || canTransition(status, "PAYMENT_PENDING");
}
