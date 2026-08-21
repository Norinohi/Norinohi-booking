import type { quote } from "@yacht-charter/db/schema/quote";

import type { BookingStatus } from "./booking-state";
import type { QuoteLine } from "@yacht-charter/db/schema/quote";
import { describe, expect, it } from "vitest";

import { amountDue, atCheckInMinor, outstandingMinor, payableNowFor } from "./checkout-amounts";
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
    route: null,
    routeOptions: [],
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

/*
 * What every Pay affordance reads, and the only thing that decides whether one is shown at
 * all. It answers two different questions behind one name, so the cases below are mostly
 * about which of the two a given status gets.
 */
/* The quote fixture expires 2026-08-01, so every case below is read from before that. */
const NOW = new Date("2026-07-15T00:00:00.000Z");

/** A booking whose provider hold has not lapsed, which is the ordinary case. */
const live = (status: BookingStatus, holdExpiresAt: Date | null = null) => ({
  status,
  holdExpiresAt,
});

describe("payableNowFor", () => {
  it("asks a confirmed charter for everything it still owes", () => {
    expect(payableNowFor(quoteRow(LINES), 250_000, live("CONFIRMED"), NOW)).toBe(250_000);
  });

  it("asks an unpaid booking for the prepayment, not the whole charter", () => {
    // The deposit policy is what the customer agreed to; the balance comes later.
    expect(payableNowFor(quoteRow(LINES), 0, live("OPTION_HELD"), NOW)).toBe(250_000);
  });

  it("asks for the whole collectable total under a full-prepayment policy", () => {
    const row = quoteRow(LINES, {
      paymentPolicy: { mode: "full", depositPct: 1, currency: "EUR" },
    });
    expect(payableNowFor(row, 0, live("OPTION_HELD"), NOW)).toBe(500_000);
  });

  it("subtracts a deposit that already arrived by transfer", () => {
    // The regression this exists for: a customer part-paid before confirmation must not be
    // asked for the prepayment a second time.
    expect(payableNowFor(quoteRow(LINES), 100_000, live("PAYMENT_PENDING"), NOW)).toBe(150_000);
  });

  it("lets an abandoned checkout be resumed", () => {
    // PAYMENT_PENDING is not a legal move to itself, so the transition table alone would
    // refuse the one case the resume path exists for.
    expect(payableNowFor(quoteRow(LINES), 0, live("PAYMENT_PENDING"), NOW)).toBe(250_000);
  });

  it("lets a failed payment be retried", () => {
    expect(payableNowFor(quoteRow(LINES), 0, live("PAYMENT_FAILED"), NOW)).toBe(250_000);
  });

  it("offers nothing on a booking whose price has to be found again", () => {
    // Both are one move from QUOTED and none from PAYMENT_PENDING: they reprice, they do
    // not pay.
    expect(payableNowFor(quoteRow(LINES), 0, live("QUOTE_EXPIRED"), NOW)).toBe(0);
    expect(payableNowFor(quoteRow(LINES), 0, live("OPTION_EXPIRED"), NOW)).toBe(0);
  });

  it("offers nothing on a booking that is over", () => {
    expect(payableNowFor(quoteRow(LINES), 250_000, live("CANCELLED"), NOW)).toBe(0);
    expect(payableNowFor(quoteRow(LINES), 250_000, live("REFUNDED"), NOW)).toBe(0);
    expect(payableNowFor(quoteRow(LINES), 250_000, live("REFUND_PENDING"), NOW)).toBe(0);
  });

  it("offers nothing while a booking is mid-commit", () => {
    // Money is already in and the provider is being asked; a second charge here would be
    // for a charter nobody has agreed to yet.
    expect(payableNowFor(quoteRow(LINES), 250_000, live("CONFIRMING"), NOW)).toBe(0);
  });

  it("offers nothing on a settled charter", () => {
    expect(payableNowFor(quoteRow(LINES), 500_000, live("CONFIRMED"), NOW)).toBe(0);
  });

  it("hides the button once the quote has run out", () => {
    // The button's whole job is to be honest about this: `confirmCheckout` answers
    // QUOTE_EXPIRED here, and finding that out after typing a card number is worse than
    // never being offered the button.
    const stale = new Date("2026-08-02T00:00:00.000Z");
    expect(payableNowFor(quoteRow(LINES), 0, live("OPTION_HELD"), stale)).toBe(0);
  });

  it("hides the button once the provider hold has lapsed", () => {
    const held = live("OPTION_HELD", new Date("2026-07-14T00:00:00.000Z"));
    expect(payableNowFor(quoteRow(LINES), 0, held, NOW)).toBe(0);
  });

  it("keeps offering the balance on a confirmed charter whose quote and hold are long gone", () => {
    // Both lapse in the ordinary course of a booking made months ahead, and neither says
    // anything about whether the second installment can be collected.
    const old = live("CONFIRMED", new Date("2026-07-01T00:00:00.000Z"));
    expect(payableNowFor(quoteRow(LINES), 250_000, old, new Date("2027-01-01T00:00:00.000Z"))).toBe(
      250_000,
    );
  });
});

/*
 * The identity every money block renders, on the booking page and in the three emails that
 * carry one: total, paid, due at the marina, still to pay. They are four separate figures
 * from three separate functions, and the emails shipped without the third for long enough
 * that their own preview data showed a €125 hole nobody could account for.
 */
describe("total, paid, at the marina and outstanding add up", () => {
  const settlesTo = (lines: QuoteLine[], paidMinor: number) => {
    const priced = quoteRow(lines);
    return {
      total: priced.totalMinor,
      parts: paidMinor + atCheckInMinor(priced) + outstandingMinor(priced, paidMinor),
    };
  };

  it("with nothing paid", () => {
    const { total, parts } = settlesTo(LINES, 0);
    expect(parts).toBe(total);
  });

  it("with the deposit in", () => {
    const { total, parts } = settlesTo(LINES, 265_000);
    expect(parts).toBe(total);
  });

  it("with the charter settled, which is where the missing row showed", () => {
    const { total, parts } = settlesTo(LINES, 500_000);
    expect(parts).toBe(total);
    // The whole point: paid short of the total, and nothing left to chase.
    expect(outstandingMinor(quoteRow(LINES), 500_000)).toBe(0);
  });

  it("with no at-check-in line at all, where the row is not rendered", () => {
    const collectable = [line({ code: "base", amountMinor: 500_000, payWhen: "now" })];
    const { total, parts } = settlesTo(collectable, 200_000);

    expect(atCheckInMinor(quoteRow(collectable))).toBe(0);
    expect(parts).toBe(total);
  });
});
