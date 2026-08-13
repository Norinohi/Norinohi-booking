import type { payment } from "@yacht-charter/db/schema/booking";

export type PaymentRow = typeof payment.$inferSelect;

/** A payment that carries an intent id, so Stripe can be asked to reverse it. */
export type CardPaymentRow = PaymentRow & { stripePaymentIntentId: string };

export type RefundPlan = {
  /** Card money, returnable through the API. */
  viaStripe: CardPaymentRow[];
  /** Money that arrived by bank transfer, which no API call can send back. */
  manual: PaymentRow[];
  alreadyRefundedMinor: number;
};

function isCardPayment(row: PaymentRow): row is CardPaymentRow {
  return Boolean(row.stripePaymentIntentId);
}

/**
 * What is still owed back on a booking, split by how it can be returned.
 *
 * Kept apart from refund.ts, which reaches Stripe and therefore the server env:
 * which payments are actionable is the part that decides whether a customer gets
 * their money, and it must be checkable without a configured Stripe account.
 */
export function planRefund(payments: readonly PaymentRow[]): RefundPlan {
  const viaStripe: CardPaymentRow[] = [];
  const manual: PaymentRow[] = [];
  let alreadyRefundedMinor = 0;

  for (const row of payments) {
    if (row.status === "refunded") {
      alreadyRefundedMinor += row.amountMinor;
      continue;
    }

    // Only money that actually arrived can be given back. A failed or
    // still-pending intent needs cancelling, not refunding.
    if (row.status !== "succeeded" || row.refundedAt) continue;

    if (isCardPayment(row)) viaStripe.push(row);
    else manual.push(row);
  }

  return { viaStripe, manual, alreadyRefundedMinor };
}
