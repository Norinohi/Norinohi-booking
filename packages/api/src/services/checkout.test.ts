import type { quote } from "@yacht-charter/db/schema/quote";
import type { QuoteLine } from "@yacht-charter/db/schema/quote";
import { describe, expect, it } from "vitest";

import { amountDue, outstandingMinor } from "./checkout";
import { payableNowMinor, totalMinor } from "./pricing";

type QuoteRow = typeof quote.$inferSelect;

const line = (over: Partial<QuoteLine> = {}): QuoteLine => ({
  code: "base",
  label: "Charter",
  amountMinor: 100_000,
  currency: "EUR",
  payWhen: "now",
  kind: "base",
  ...over,
});

/**
 * A quote row whose stored totals are derived from its lines the way
 * persistPricedQuote derives them, so the fixture cannot drift by accident.
 */
const quoteRow = (lines: QuoteLine[], over: Partial<QuoteRow> = {}): QuoteRow =>
  ({
    id: "qte_1",
    listingId: "ylst_1",
    userId: "usr_1",
    provider: "mock",
    providerSourceId: "src_1",
    providerQuoteId: null,
    checkIn: "2026-08-08",
    checkOut: "2026-08-15",
    guests: 2,
    extras: [],
    crewType: null,
    currency: "EUR",
    lines,
    totalMinor: totalMinor(lines),
    depositMinor: Math.round(payableNowMinor(lines) * 0.5),
    securityDepositMinor: null,
    paymentPolicy: { mode: "deposit", depositPct: 0.5, currency: "EUR" },
    discountId: null,
    discountCode: null,
    creditAppliedMinor: 0,
    priceSourceHash: "hash",
    status: "active",
    expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    validatedAt: new Date("2026-07-01T00:00:00.000Z"),
    supersededByQuoteId: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-01T00:00:00.000Z"),
    ...over,
  }) satisfies QuoteRow;

const LINES = [
  line({ code: "base", amountMinor: 500_000, payWhen: "now" }),
  line({ code: "fuel", amountMinor: 30_000, payWhen: "at_check_in", kind: "extra" }),
];

describe("amountDue", () => {
  it("charges the deposit when that is the preference", () => {
    const row = quoteRow(LINES);
    expect(row.depositMinor).toBe(250_000);
    expect(amountDue(row, "deposit")).toBe(250_000);
  });

  it("charges everything except the at-check-in lines when prepaying in full", () => {
    expect(amountDue(quoteRow(LINES), "full")).toBe(500_000);
  });

  it("never charges a deposit larger than what is actually payable now", () => {
    const row = quoteRow(LINES, { depositMinor: 900_000 });
    expect(amountDue(row, "deposit")).toBe(500_000);
  });

  it("charges nothing when every line is settled at check-in", () => {
    const row = quoteRow([line({ amountMinor: 80_000, payWhen: "at_check_in" })]);
    expect(amountDue(row, "full")).toBe(0);
    expect(amountDue(row, "deposit")).toBe(0);
  });
});

/*
 * amountDue and payableNowMinor are two formulas for one concept:
 *
 *   payableNowMinor  = Σ(lines where payWhen === "now")
 *   amountDue(full)  = quote.totalMinor − Σ(lines where payWhen === "at_check_in")
 *
 * payWhen has exactly two values, so these agree for as long as the stored
 * totalMinor equals the unclamped sum of the lines. They part company the
 * moment the row disagrees with its own lines — which totalMinor's own clamp
 * at zero is already enough to cause.
 *
 * Left as-is deliberately: picking one moves money, so it is a product call.
 */
describe("amountDue vs payableNowMinor", () => {
  it("agree for an ordinary quote", () => {
    const row = quoteRow(LINES);
    expect(amountDue(row, "full")).toBe(payableNowMinor(row.lines));
  });

  it("agree when a credit line reduces but does not invert the total", () => {
    const row = quoteRow([
      line({ amountMinor: 500_000, payWhen: "now" }),
      line({ code: "credit", amountMinor: -100_000, payWhen: "now", kind: "credit" }),
      line({ code: "fuel", amountMinor: 30_000, payWhen: "at_check_in", kind: "extra" }),
    ]);

    expect(amountDue(row, "full")).toBe(400_000);
    expect(payableNowMinor(row.lines)).toBe(400_000);
  });

  it("DIVERGE once totalMinor clamps a net-negative quote to zero", () => {
    // Σ(all) = -100_000, so the stored total clamps to 0 while the now lines
    // still sum to +100_000. amountDue then subtracts a negative and bills
    // double what payableNowMinor says is owed.
    const row = quoteRow([
      line({ amountMinor: 100_000, payWhen: "now" }),
      line({ code: "credit", amountMinor: -200_000, payWhen: "at_check_in", kind: "credit" }),
    ]);

    expect(row.totalMinor).toBe(0);
    expect(payableNowMinor(row.lines)).toBe(100_000);
    expect(amountDue(row, "full")).toBe(200_000);
  });

  it("DIVERGE once the stored total drifts from the lines", () => {
    // Nothing recomputes totalMinor from lines at read time, so any writer that
    // sets one without the other silently changes what the customer is charged.
    const row = quoteRow(LINES, { totalMinor: 999_000 });

    expect(payableNowMinor(row.lines)).toBe(500_000);
    expect(amountDue(row, "full")).toBe(969_000);
  });
});

/*
 * The figure the balance page advertises and `checkout.payBalance` charges. They read
 * the same function on purpose: a screen offering one amount while the server takes
 * another is worse than no screen.
 */
describe("outstandingMinor", () => {
  it("owes the whole collectable total when nothing has been paid", () => {
    // 500_000 payable now; the 30_000 check-in extra is the base's to collect.
    expect(outstandingMinor(quoteRow(LINES), 0)).toBe(500_000);
  });

  it("subtracts what has been settled", () => {
    expect(outstandingMinor(quoteRow(LINES), 250_000)).toBe(250_000);
  });

  it("never chases the pay-at-check-in lines", () => {
    // Paying everything collectable leaves nothing, even though the total is higher.
    expect(outstandingMinor(quoteRow(LINES), 500_000)).toBe(0);
  });

  it("floors at zero rather than reporting a credit", () => {
    expect(outstandingMinor(quoteRow(LINES), 900_000)).toBe(0);
  });

  it("owes the full total on a full-prepayment policy too", () => {
    const row = quoteRow(LINES, {
      paymentPolicy: { mode: "full", depositPct: 1, currency: "EUR" },
    });
    expect(outstandingMinor(row, 0)).toBe(500_000);
  });
});
