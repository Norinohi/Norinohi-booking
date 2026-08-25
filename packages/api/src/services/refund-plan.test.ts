import { describe, expect, it } from "vitest";

import { allocate, planRefund, type RefundRow } from "./refund-plan";

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
    authorizedAt: null,
    paidAt: new Date("2026-08-01T10:00:00Z"),
    refundedAt: null,
    disputedAt: null,
    disputeStatus: null,
    idempotencyKey: "pay:bkg_1:deposit:50000",
    createdAt: new Date("2026-08-01T10:00:00Z"),
    updatedAt: new Date("2026-08-01T10:00:00Z"),
    ...overrides,
  };
}

function refundRow(overrides: Partial<RefundRow> = {}): RefundRow {
  return {
    id: "prf_1",
    paymentId: "pmt_1",
    amountMinor: 50_000,
    currency: "EUR",
    status: "succeeded",
    stripeRefundId: "re_1",
    reason: null,
    failureReason: null,
    settledAt: new Date("2026-08-02T10:00:00Z"),
    createdAt: new Date("2026-08-02T10:00:00Z"),
    updatedAt: new Date("2026-08-02T10:00:00Z"),
    ...overrides,
  };
}

describe("planRefund", () => {
  it("refunds a settled card payment through Stripe", () => {
    const plan = planRefund([paymentRow()]);

    expect(plan.viaStripe).toHaveLength(1);
    expect(plan.manual).toHaveLength(0);
    expect(plan.alreadyRefundedMinor).toBe(0);
    expect(plan.outstandingMinor).toBe(50_000);
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
    expect(plan.outstandingMinor).toBe(0);
  });

  it("counts what is already back without queueing it again", () => {
    const plan = planRefund([paymentRow()], [refundRow()]);

    expect(plan.viaStripe).toHaveLength(0);
    expect(plan.alreadyRefundedMinor).toBe(50_000);
    expect(plan.outstandingMinor).toBe(0);
  });

  it("reads a payment refunded before refunds were recorded individually", () => {
    const plan = planRefund([paymentRow({ status: "refunded", refundedAt: new Date() })]);

    expect(plan.viaStripe).toHaveLength(0);
    expect(plan.alreadyRefundedMinor).toBe(50_000);
  });

  it("leaves only the unreturned part of a part-refunded payment outstanding", () => {
    const plan = planRefund([paymentRow()], [refundRow({ amountMinor: 20_000 })]);

    expect(plan.alreadyRefundedMinor).toBe(20_000);
    expect(plan.outstandingMinor).toBe(30_000);
    expect(plan.viaStripe[0]?.outstandingMinor).toBe(30_000);
  });

  it("treats a refund Stripe has accepted but not settled as already spent", () => {
    const plan = planRefund([paymentRow()], [refundRow({ status: "pending", settledAt: null })]);

    expect(plan.outstandingMinor).toBe(0);
  });

  it("gives a failed refund's money back to the pile", () => {
    const plan = planRefund([paymentRow()], [refundRow({ status: "failed", settledAt: null })]);

    expect(plan.alreadyRefundedMinor).toBe(0);
    expect(plan.outstandingMinor).toBe(50_000);
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

    expect(plan.viaStripe.map((item) => item.payment.id)).toEqual(["pmt_dep", "pmt_bal"]);
    expect(plan.outstandingMinor).toBe(120_000);
  });

  it("keeps a part-refunded booking outstanding, so it cannot settle early", () => {
    const plan = planRefund(
      [
        paymentRow({ id: "pmt_dep" }),
        paymentRow({ id: "pmt_bal", amountMinor: 70_000, stripePaymentIntentId: "pi_2" }),
      ],
      [refundRow({ paymentId: "pmt_dep" })],
    );

    expect(plan.alreadyRefundedMinor).toBe(50_000);
    expect(plan.viaStripe).toHaveLength(1);
    expect(plan.outstandingMinor).toBe(70_000);
  });
});

describe("allocate", () => {
  const deposit = { payment: paymentRow({ id: "pmt_dep" }), outstandingMinor: 50_000 };
  const balance = { payment: paymentRow({ id: "pmt_bal" }), outstandingMinor: 70_000 };

  it("takes everything when no amount is named", () => {
    expect(allocate([deposit, balance], undefined)).toHaveLength(2);
  });

  it("fills from the largest payment first, so a refund touches as few as it can", () => {
    const allocated = allocate([deposit, balance], 60_000);

    expect(allocated).toEqual([{ payment: balance.payment, outstandingMinor: 60_000 }]);
  });

  it("spills onto the next payment once the largest runs out", () => {
    const allocated = allocate([deposit, balance], 100_000);

    expect(allocated.map((item) => item.outstandingMinor)).toEqual([70_000, 30_000]);
  });

  it("returns what it can rather than failing when the request exceeds what is there", () => {
    const allocated = allocate([deposit], 90_000);

    expect(allocated).toEqual([{ payment: deposit.payment, outstandingMinor: 50_000 }]);
  });
});
