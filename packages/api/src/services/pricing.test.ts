import type { QuoteLine, QuotePaymentPolicy } from "@yacht-charter/db/schema/quote";
import { describe, expect, it } from "vitest";

import {
  type PriceAdjustment,
  buildPaymentSchedulePreview,
  payableNowMinor,
  perPersonMinor,
  resolveAdjustedPrice,
  resolvePaymentPolicy,
  totalMinor,
} from "./pricing";

const rule = (over: Partial<PriceAdjustment> = {}): PriceAdjustment => ({
  id: "par_1",
  name: "Rule",
  type: "percentage",
  valuePct: 10,
  valueMinor: null,
  priority: 0,
  stackable: true,
  ...over,
});

const line = (over: Partial<QuoteLine> = {}): QuoteLine => ({
  code: "base",
  label: "Charter",
  amountMinor: 100_000,
  currency: "EUR",
  payWhen: "now",
  kind: "base",
  ...over,
});

describe("resolveAdjustedPrice", () => {
  it("returns the base untouched when there are no adjustments", () => {
    expect(resolveAdjustedPrice(100_000, [])).toEqual({
      amountMinor: 100_000,
      appliedRuleId: null,
      appliedRuleLabel: null,
      applied: [],
    });
  });

  it("reads valuePct as a 0-100 percentage off, not a 0-1 ratio", () => {
    expect(resolveAdjustedPrice(100_000, [rule({ valuePct: 10 })]).amountMinor).toBe(90_000);
  });

  it("coerces the numeric string drizzle returns for valuePct", () => {
    expect(resolveAdjustedPrice(100_000, [rule({ valuePct: "10.0000" })]).amountMinor).toBe(90_000);
  });

  it("rounds rather than truncates", () => {
    // 33333 * (1 - 0.1) = 29999.7
    expect(resolveAdjustedPrice(33_333, [rule({ valuePct: 10 })]).amountMinor).toBe(30_000);
  });

  it("applies highest priority first", () => {
    const result = resolveAdjustedPrice(100_000, [
      rule({ id: "low", name: "Low", priority: 1, valuePct: 50 }),
      rule({ id: "high", name: "High", priority: 9, valuePct: 10 }),
    ]);

    // 100000 -> 90000 (High) -> 45000 (Low)
    expect(result.amountMinor).toBe(45_000);
    expect(result.appliedRuleId).toBe("high");
    expect(result.appliedRuleLabel).toBe("High");
    expect(result.applied.map((a) => a.sourceId)).toEqual(["high", "low"]);
  });

  it("stops the chain at the first non-stackable rule", () => {
    const result = resolveAdjustedPrice(100_000, [
      rule({ id: "first", priority: 9, valuePct: 10, stackable: false }),
      rule({ id: "second", priority: 1, valuePct: 50 }),
    ]);

    expect(result.amountMinor).toBe(90_000);
    expect(result.applied.map((a) => a.sourceId)).toEqual(["first"]);
  });

  it("treats fixed_amount as an absolute replacement price, not a discount", () => {
    const result = resolveAdjustedPrice(100_000, [
      rule({ type: "fixed_amount", valuePct: null, valueMinor: 250_000 }),
    ]);

    expect(result.amountMinor).toBe(250_000);
    expect(result.applied[0]?.amountMinor).toBe(150_000);
  });

  it("skips an unparseable percentage and a fixed_amount with no amount", () => {
    const skipped = [
      rule({ id: "nan-pct", valuePct: "not a number" }),
      rule({ id: "no-minor", type: "fixed_amount", valuePct: null, valueMinor: null }),
    ];

    const result = resolveAdjustedPrice(100_000, skipped);
    expect(result.amountMinor).toBe(100_000);
    expect(result.applied).toEqual([]);
    // A genuinely skipped adjustment never claims the applied-rule slot.
    expect(result.appliedRuleId).toBeNull();
  });

  it("treats a null percentage as 0% rather than skipping it", () => {
    // Number(null) is 0, which is finite, so applyOne succeeds. The price does
    // not move, but the rule still claims appliedRuleId/Label — so a misconfigured
    // rule surfaces a label on the admin screen while doing nothing.
    const result = resolveAdjustedPrice(100_000, [rule({ id: "no-pct", valuePct: null })]);

    expect(result.amountMinor).toBe(100_000);
    expect(result.applied).toEqual([]);
    expect(result.appliedRuleId).toBe("no-pct");
  });

  it("claims the applied-rule slot even when the delta is zero", () => {
    // applyOne succeeded, so appliedRuleId is set, but nothing is pushed to
    // `applied` because the price did not move. Both halves are load-bearing:
    // the label drives the admin screen, the list drives the snapshot rows.
    const result = resolveAdjustedPrice(100_000, [rule({ id: "zero", valuePct: 0 })]);

    expect(result.appliedRuleId).toBe("zero");
    expect(result.applied).toEqual([]);
  });

  it("never returns a negative price", () => {
    const result = resolveAdjustedPrice(100_000, [rule({ valuePct: 250 })]);
    expect(result.amountMinor).toBe(0);
  });

  it("does not mutate the caller's array while sorting by priority", () => {
    const input = [rule({ id: "a", priority: 1 }), rule({ id: "b", priority: 9 })];
    resolveAdjustedPrice(100_000, input);
    expect(input.map((a) => a.id)).toEqual(["a", "b"]);
  });
});

describe("resolvePaymentPolicy", () => {
  const provider = { mode: "deposit" as const, depositPct: 0.3 };

  /*
   * Two months before this check-in is 2026-08-10, so `farOut` sits well before
   * deposits close and `insideWindow` sits after. Every assertion that is not
   * about lead time uses `farOut`, so the rule cannot quietly decide it.
   */
  const farOut = { checkIn: "2026-10-10", asOf: new Date("2026-01-01T00:00:00.000Z") };
  const insideWindow = { checkIn: "2026-10-10", asOf: new Date("2026-09-01T00:00:00.000Z") };

  it("expresses depositPct as a 0-1 ratio, unlike PriceAdjustment.valuePct", () => {
    expect(resolvePaymentPolicy(null, provider, "EUR", farOut).depositPct).toBe(0.3);
  });

  it("prefers an explicit listing override over the provider plan", () => {
    expect(
      resolvePaymentPolicy({ mode: "deposit", depositPct: 0.25 }, provider, "EUR", farOut),
    ).toEqual({
      mode: "deposit",
      depositPct: 0.25,
      balanceDueAt: "2026-08-10",
      currency: "EUR",
    });
  });

  it("forces 100% when the mode is full, whatever depositPct said", () => {
    const policy = resolvePaymentPolicy(
      { mode: "full", depositPct: 0.25 },
      provider,
      "EUR",
      farOut,
    );
    expect(policy).toMatchObject({ mode: "full", depositPct: 1 });
  });

  it("falls back to the marketplace default of half when nobody specifies", () => {
    const policy = resolvePaymentPolicy({ mode: "deposit" }, provider, "EUR", farOut);
    expect(policy.depositPct).toBe(0.5);
  });

  it("inherits balanceDueAt from the provider when the override omits it", () => {
    const policy = resolvePaymentPolicy(
      { mode: "deposit", depositPct: 0.25 },
      { ...provider, balanceDueAt: "2026-07-01" },
      "EUR",
      farOut,
    );
    expect(policy.balanceDueAt).toBe("2026-07-01");
  });

  it("carries the currency through untouched, including case", () => {
    expect(resolvePaymentPolicy(null, provider, "usd", farOut).currency).toBe("usd");
  });

  describe("lead time", () => {
    it("takes the whole amount for a charter starting inside two months", () => {
      const policy = resolvePaymentPolicy(
        { mode: "deposit", depositPct: 0.25 },
        provider,
        "EUR",
        insideWindow,
      );
      expect(policy).toMatchObject({ mode: "full", depositPct: 1 });
    });

    it("treats exactly two months out as too late, since the rule is *more* than two", () => {
      const policy = resolvePaymentPolicy(null, provider, "EUR", {
        checkIn: "2026-10-10",
        asOf: new Date("2026-08-10T00:00:00.000Z"),
      });
      expect(policy.mode).toBe("full");
    });

    it("still offers the deposit the day before deposits close", () => {
      const policy = resolvePaymentPolicy(null, provider, "EUR", {
        checkIn: "2026-10-10",
        asOf: new Date("2026-08-09T23:59:59.000Z"),
      });
      expect(policy).toMatchObject({ mode: "deposit", depositPct: 0.3 });
    });

    it("only tightens: a provider demanding full prepayment months out keeps it", () => {
      const policy = resolvePaymentPolicy(null, { mode: "full", depositPct: 1 }, "EUR", farOut);
      expect(policy).toMatchObject({ mode: "full", depositPct: 1 });
    });

    it("leaves the deposit on offer when the check-in date does not parse", () => {
      const policy = resolvePaymentPolicy(null, provider, "EUR", {
        checkIn: "not-a-date",
        asOf: new Date("2026-09-01T00:00:00.000Z"),
      });
      expect(policy).toMatchObject({ mode: "deposit", balanceDueAt: undefined });
    });

    it("dates an undated deposit at the moment deposits close", () => {
      const policy = resolvePaymentPolicy(null, { mode: "deposit", depositPct: 0.5 }, "EUR", {
        checkIn: "2026-04-30",
        asOf: new Date("2026-01-01T00:00:00.000Z"),
      });
      expect(policy.balanceDueAt).toBe("2026-02-28");
    });

    it("leaves a full-prepayment policy with no balance date, there being no balance", () => {
      const policy = resolvePaymentPolicy(null, provider, "EUR", insideWindow);
      expect(policy.balanceDueAt).toBeUndefined();
    });
  });
});

describe("payableNowMinor / totalMinor", () => {
  const lines = [
    line({ code: "base", amountMinor: 500_000, payWhen: "now" }),
    line({ code: "skipper", amountMinor: 90_000, payWhen: "now", kind: "extra" }),
    line({ code: "fuel", amountMinor: 30_000, payWhen: "at_check_in", kind: "extra" }),
  ];

  it("totals every line regardless of when it is paid", () => {
    expect(totalMinor(lines)).toBe(620_000);
  });

  it("counts only the now lines as payable up front", () => {
    expect(payableNowMinor(lines)).toBe(590_000);
  });

  it("returns zero for an empty quote", () => {
    expect(totalMinor([])).toBe(0);
    expect(payableNowMinor([])).toBe(0);
  });

  it("clamps a net-negative quote to zero rather than refunding", () => {
    const overCredited = [
      line({ amountMinor: 100_000, payWhen: "now" }),
      line({ code: "credit", amountMinor: -150_000, payWhen: "now", kind: "credit" }),
    ];

    expect(totalMinor(overCredited)).toBe(0);
    expect(payableNowMinor(overCredited)).toBe(0);
  });
});

describe("buildPaymentSchedulePreview", () => {
  const policy = (over: Partial<QuotePaymentPolicy> = {}): QuotePaymentPolicy => ({
    mode: "deposit",
    depositPct: 0.5,
    balanceDueAt: "2026-06-30",
    currency: "EUR",
    ...over,
  });

  const preview = (over: Partial<Parameters<typeof buildPaymentSchedulePreview>[0]> = {}) =>
    buildPaymentSchedulePreview({
      lines: [
        line({ amountMinor: 1_000_000, payWhen: "now" }),
        line({ code: "cleaning", amountMinor: 15_000, payWhen: "at_check_in", kind: "fee" }),
      ],
      paymentPolicy: policy(),
      depositMinor: 500_000,
      securityDepositMinor: 200_000,
      checkIn: "2026-07-07",
      currency: "EUR",
      ...over,
    });

  it("splits a deposit policy into deposit, balance, check-in extras and security deposit", () => {
    expect(preview()).toEqual([
      { kind: "deposit", amountMinor: 500_000, currency: "EUR", dueAt: null },
      { kind: "balance", amountMinor: 500_000, currency: "EUR", dueAt: "2026-06-30" },
      { kind: "checkin_extras", amountMinor: 15_000, currency: "EUR", dueAt: "2026-07-07" },
      { kind: "security_deposit", amountMinor: 200_000, currency: "EUR", dueAt: "2026-07-07" },
    ]);
  });

  it("opens with a single full payment when the policy takes everything up front", () => {
    const entries = preview({ paymentPolicy: policy({ mode: "full", depositPct: 1 }) });

    expect(entries[0]).toEqual({
      kind: "full",
      amountMinor: 1_000_000,
      currency: "EUR",
      dueAt: null,
    });
    expect(entries.some((entry) => entry.kind === "balance")).toBe(false);
  });

  it("keeps an undated balance rather than dropping the instalment", () => {
    const entries = preview({ paymentPolicy: policy({ balanceDueAt: undefined }) });

    expect(entries[1]).toMatchObject({ kind: "balance", dueAt: null });
  });

  it("omits a balance the deposit already covers", () => {
    const entries = preview({ depositMinor: 1_000_000 });

    expect(entries.map((entry) => entry.kind)).toEqual([
      "deposit",
      "checkin_extras",
      "security_deposit",
    ]);
  });

  it("omits the security deposit when the yacht asks for none", () => {
    const entries = preview({ securityDepositMinor: null });

    expect(entries.some((entry) => entry.kind === "security_deposit")).toBe(false);
  });

  it("charges the same figure checkout.confirm will take", () => {
    const [first] = preview();

    expect(first?.amountMinor).toBe(500_000);
    expect(first?.dueAt).toBeNull();
  });
});

describe("perPersonMinor", () => {
  it("splits the total across the party", () => {
    expect(perPersonMinor(1_200_000, 6)).toBe(200_000);
  });

  it("rounds to the nearest minor unit", () => {
    expect(perPersonMinor(1_000_00, 3)).toBe(33_333);
  });

  it("returns null rather than dividing by zero", () => {
    expect(perPersonMinor(1_000_000, 0)).toBeNull();
  });
});
