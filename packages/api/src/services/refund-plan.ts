import type { payment, paymentRefund } from "@yacht-charter/db/schema/booking";

export type PaymentRow = typeof payment.$inferSelect;
export type RefundRow = typeof paymentRefund.$inferSelect;

/** A payment that carries an intent id, so Stripe can be asked to reverse it. */
export type CardPaymentRow = PaymentRow & { stripePaymentIntentId: string };

/** A payment with money still to return, and how much of it is left. */
export type Refundable<Row extends PaymentRow = PaymentRow> = {
  payment: Row;
  outstandingMinor: number;
};

export type RefundPlan = {
  /** Card money, returnable through the API. */
  viaStripe: Refundable<CardPaymentRow>[];
  /** Money that arrived by bank transfer, which no API call can send back. */
  manual: Refundable[];
  alreadyRefundedMinor: number;
  /** Everything still owed back, however it has to travel. */
  outstandingMinor: number;
};

function isCardPayment(row: PaymentRow): row is CardPaymentRow {
  return Boolean(row.stripePaymentIntentId);
}

/**
 * A refund that is still `pending` counts as spent, not as available. Stripe has accepted it and
 * the money is on its way out; treating it as unreturned is how a booking gets refunded twice.
 * Only an outright failure gives the amount back to the pile.
 */
function isCommitted(refund: RefundRow): boolean {
  return refund.status === "succeeded" || refund.status === "pending";
}

/**
 * What is still owed back on a booking, split by how it can be returned.
 *
 * Kept apart from refund.ts, which reaches Stripe and therefore the server env:
 * which payments are actionable is the part that decides whether a customer gets
 * their money, and it must be checkable without a configured Stripe account.
 */
export function planRefund(
  payments: readonly PaymentRow[],
  refunds: readonly RefundRow[] = [],
): RefundPlan {
  const returnedByPayment = new Map<string, number>();

  for (const refund of refunds) {
    if (!isCommitted(refund)) continue;
    returnedByPayment.set(
      refund.paymentId,
      (returnedByPayment.get(refund.paymentId) ?? 0) + refund.amountMinor,
    );
  }

  const viaStripe: Refundable<CardPaymentRow>[] = [];
  const manual: Refundable[] = [];
  let alreadyRefundedMinor = 0;
  let outstandingMinor = 0;

  for (const row of payments) {
    /*
     * `refunded` means nothing is left, and it is only ever written once that is true — which
     * is also what makes payments returned before refunds were recorded individually read
     * correctly here, rather than being queued a second time.
     */
    const returned =
      row.status === "refunded" ? row.amountMinor : (returnedByPayment.get(row.id) ?? 0);
    alreadyRefundedMinor += returned;

    // Only money that actually arrived can be given back. A failed or
    // still-pending intent needs cancelling, not refunding.
    if (row.status !== "succeeded" && row.status !== "refunded") continue;

    const outstanding = row.amountMinor - returned;
    if (outstanding <= 0) continue;

    outstandingMinor += outstanding;

    if (isCardPayment(row)) viaStripe.push({ payment: row, outstandingMinor: outstanding });
    else manual.push({ payment: row, outstandingMinor: outstanding });
  }

  return { viaStripe, manual, alreadyRefundedMinor, outstandingMinor };
}

/**
 * How a requested sum is split across the payments that can carry it, largest first so a refund
 * touches as few payments — and therefore as few Stripe calls — as it can. An omitted request
 * means everything outstanding.
 *
 * Returning less than was asked for is not an error here: the caller decides whether a shortfall
 * matters, and it is the one that knows whether the rest is a bank transfer nobody can automate.
 */
export function allocate<Row extends PaymentRow>(
  refundables: readonly Refundable<Row>[],
  requestedMinor: number | undefined,
): Refundable<Row>[] {
  if (requestedMinor === undefined) return [...refundables];

  let remaining = requestedMinor;
  const allocated: Refundable<Row>[] = [];

  for (const item of [...refundables].sort((a, b) => b.outstandingMinor - a.outstandingMinor)) {
    if (remaining <= 0) break;
    const take = Math.min(item.outstandingMinor, remaining);
    allocated.push({ payment: item.payment, outstandingMinor: take });
    remaining -= take;
  }

  return allocated;
}
