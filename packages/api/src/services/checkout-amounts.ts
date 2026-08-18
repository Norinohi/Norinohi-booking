import type { quote } from "@yacht-charter/db/schema/quote";

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
