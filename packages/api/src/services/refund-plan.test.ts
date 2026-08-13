import { describe, expect, it } from "vitest";

import { planRefund } from "./refund-plan";

type Payment = Parameters<typeof planRefund>[0][number];

function paymentRow(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pmt_1",
    bookingId: "bkg_1",
    scheduleId: "pms_1",
    kind: "deposit",
    amountMinor: 50_000,
    currency: "EUR",
    status: "succeeded",
    stripePaymentIntentId: "pi_1",
    failureReason: null,
    paidAt: new Date("2026-08-01T10:00:00Z"),
    refundedAt: null,
    idempotencyKey: "pay:bkg_1:deposit:50000",
    createdAt: new Date("2026-08-01T10:00:00Z"),
    updatedAt: new Date("2026-08-01T10:00:00Z"),
    ...overrides,
  };
}

describe("planRefund", () => {
  it("refunds a settled card payment through Stripe", () => {
    const plan = planRefund([paymentRow()]);

    expect(plan.viaStripe).toHaveLength(1);
    expect(plan.manual).toHaveLength(0);
    expect(plan.alreadyRefundedMinor).toBe(0);
  });

  it("routes a bank transfer to the manual pile — there is no intent to refund", () => {
    const plan = planRefund([paymentRow({ stripePaymentIntentId: null })]);

    expect(plan.viaStripe).toHaveLength(0);
    expect(plan.manual).toHaveLength(1);
  });

  it("leaves money that never arrived alone", () => {
    const plan = planRefund([
      paymentRow({ id: "pmt_failed", status: "failed" }),
      paymentRow({ id: "pmt_open", status: "requires_payment", paidAt: null }),
      paymentRow({ id: "pmt_processing", status: "processing" }),
    ]);

    expect(plan.viaStripe).toHaveLength(0);
    expect(plan.manual).toHaveLength(0);
  });

  it("counts what is already back without queueing it again", () => {
    const plan = planRefund([
      paymentRow({ id: "pmt_done", status: "refunded", refundedAt: new Date() }),
    ]);

    expect(plan.viaStripe).toHaveLength(0);
    expect(plan.alreadyRefundedMinor).toBe(50_000);
  });

  it("skips a payment stamped refunded before its status caught up", () => {
    const plan = planRefund([paymentRow({ refundedAt: new Date() })]);

    expect(plan.viaStripe).toHaveLength(0);
  });

  it("queues the deposit and the balance separately", () => {
    const plan = planRefund([
      paymentRow({ id: "pmt_dep", kind: "deposit", amountMinor: 50_000 }),
      paymentRow({
        id: "pmt_bal",
        kind: "balance",
        amountMinor: 70_000,
        stripePaymentIntentId: "pi_2",
      }),
    ]);

    expect(plan.viaStripe.map((row) => row.id)).toEqual(["pmt_dep", "pmt_bal"]);
  });

  it("keeps a part-refunded booking outstanding, so it cannot settle early", () => {
    const plan = planRefund([
      paymentRow({ id: "pmt_dep", status: "refunded", refundedAt: new Date() }),
      paymentRow({ id: "pmt_bal", amountMinor: 70_000, stripePaymentIntentId: "pi_2" }),
    ]);

    expect(plan.alreadyRefundedMinor).toBe(50_000);
    expect(plan.viaStripe).toHaveLength(1);
  });
});
