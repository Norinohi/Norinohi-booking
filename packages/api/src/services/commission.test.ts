import { describe, expect, it } from "vitest";

import { type CommissionRule, resolveCommissionRate } from "./commission";

const rule = (over: Partial<CommissionRule> = {}): CommissionRule => ({
  id: "pcm_a",
  providerCode: "nausys",
  operatorId: null,
  ratePct: 12,
  startsAt: null,
  endsAt: null,
  active: true,
  ...over,
});

const query = { providerCode: "nausys", operatorId: "op_istion", on: "2026-08-08" };

describe("resolveCommissionRate", () => {
  it("earns nothing while no rates have been entered, which is how it ships", () => {
    expect(resolveCommissionRate([], query)).toBe(0);
  });

  it("takes the vendor-wide rate when no operator rate was negotiated", () => {
    expect(resolveCommissionRate([rule()], query)).toBe(12);
  });

  it("prefers the rate written for this operator over the vendor's general one", () => {
    const rates = [
      rule({ ratePct: 20 }),
      rule({ id: "pcm_b", operatorId: "op_istion", ratePct: 8 }),
    ];
    expect(resolveCommissionRate(rates, query)).toBe(8);
  });

  it("ignores a rate written for a different operator", () => {
    const rates = [rule({ operatorId: "op_other", ratePct: 30 }), rule({ id: "pcm_b" })];
    expect(resolveCommissionRate(rates, query)).toBe(12);
  });

  it("ignores another vendor's rate entirely", () => {
    expect(resolveCommissionRate([rule({ providerCode: "booking_manager" })], query)).toBe(0);
  });

  it("ignores a rate that has been switched off", () => {
    expect(resolveCommissionRate([rule({ active: false })], query)).toBe(0);
  });

  it("treats both ends of the window as inclusive", () => {
    const window = rule({ startsAt: "2026-08-08", endsAt: "2026-08-08" });
    expect(resolveCommissionRate([window], query)).toBe(12);
    expect(resolveCommissionRate([window], { ...query, on: "2026-08-07" })).toBe(0);
    expect(resolveCommissionRate([window], { ...query, on: "2026-08-09" })).toBe(0);
  });

  it("treats an open end as open", () => {
    expect(resolveCommissionRate([rule({ startsAt: "2020-01-01" })], query)).toBe(12);
    expect(resolveCommissionRate([rule({ endsAt: "2030-01-01" })], query)).toBe(12);
  });

  it("settles two overlapping rules of equal specificity on the higher rate", () => {
    /* The database cannot refuse an overlap cheaply, so the answer has to be decided rather
       than left to whichever row came back first. */
    const rates = [rule({ ratePct: 10 }), rule({ id: "pcm_b", ratePct: 14 })];
    expect(resolveCommissionRate(rates, query)).toBe(14);
    expect(resolveCommissionRate([...rates].reverse(), query)).toBe(14);
  });

  it("applies a vendor-wide rate to an offer whose listing names no operator", () => {
    expect(resolveCommissionRate([rule()], { ...query, operatorId: null })).toBe(12);
  });

  it("does not apply an operator rate to an offer with no operator", () => {
    const rates = [rule({ operatorId: "op_istion", ratePct: 25 })];
    expect(resolveCommissionRate(rates, { ...query, operatorId: null })).toBe(0);
  });
});
