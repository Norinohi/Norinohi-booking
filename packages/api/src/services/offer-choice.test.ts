import { describe, expect, it } from "vitest";

import { type OfferQuoteResult, type PricedOffer, pickWinner } from "./offer-choice";

type PricedFields = Partial<
  Pick<PricedOffer, "baseMinor" | "obligatoryMinor" | "commissionPct" | "reliability">
>;

/*
 * A vendor that charges nothing on top by default, so the rate and the total agree and every
 * case that predates the split still says what it said. A case about the split sets both.
 */
const priced = (
  offerId: string,
  providerCode: string,
  totalMinor: number,
  currency = "EUR",
  over: PricedFields = {},
): OfferQuoteResult => ({
  outcome: "priced",
  offerId,
  providerCode,
  totalMinor,
  baseMinor: over.baseMinor ?? totalMinor,
  obligatoryMinor: over.obligatoryMinor ?? 0,
  currency,
  commissionPct: over.commissionPct ?? 0,
  reliability: over.reliability,
});

const bookingManager = priced("loff_bm", "booking_manager", 500_000);
const nausys = priced("loff_ns", "nausys", 460_000);

describe("pickWinner", () => {
  it("sells nothing when nobody answered with a price", () => {
    expect(pickWinner([])).toEqual({ winner: null, currencyMismatch: false });
  });

  it("takes the cheaper all-in total", () => {
    expect(pickWinner([bookingManager, nausys]).winner?.offerId).toBe("loff_ns");
  });

  it("compares the all-in total, not the headline rate", () => {
    // The point of the rule: a vendor with a lower rate and a heavier obligatory fee is not
    // the cheaper one, and by the time these arrive the fees are already inside the total.
    const cheapRateHeavyFees = priced("loff_bm", "booking_manager", 520_000);
    const dearRateNoFees = priced("loff_ns", "nausys", 500_000);
    expect(pickWinner([cheapRateHeavyFees, dearRateNoFees]).winner?.offerId).toBe("loff_ns");
  });

  it("gives a dead tie to Booking Manager", () => {
    const tied = priced("loff_ns", "nausys", 500_000);
    expect(pickWinner([tied, bookingManager]).winner?.providerCode).toBe("booking_manager");
  });

  it("does not treat a vendor that failed as an expensive one", () => {
    const broken: OfferQuoteResult = {
      outcome: "error",
      offerId: "loff_ns",
      providerCode: "nausys",
      reason: "upstream 500",
    };
    expect(pickWinner([broken, bookingManager]).winner?.offerId).toBe("loff_bm");
  });

  it("sells nothing when every vendor failed or refused", () => {
    const results: OfferQuoteResult[] = [
      { outcome: "timeout", offerId: "loff_bm", providerCode: "booking_manager", reason: "6s" },
      { outcome: "unavailable", offerId: "loff_ns", providerCode: "nausys", reason: "sold" },
    ];
    expect(pickWinner(results).winner).toBeNull();
  });

  it("sells nothing when every offer was ruled out before anyone was asked", () => {
    const results: OfferQuoteResult[] = [
      {
        outcome: "ineligible",
        offerId: "loff_bm",
        providerCode: "booking_manager",
        reason: "occupied",
      },
      { outcome: "ineligible", offerId: "loff_ns", providerCode: "nausys", reason: "checkin-day" },
    ];
    expect(pickWinner(results)).toEqual({ winner: null, currencyMismatch: false });
  });

  it("reports one price as one price, whatever currency it is in", () => {
    const only = priced("loff_ns", "nausys", 400_000, "HRK");
    expect(pickWinner([only])).toEqual({ winner: only, currencyMismatch: false });
  });

  it("compares within the listing's own currency when the two disagree", () => {
    const inEuros = priced("loff_bm", "booking_manager", 500_000, "EUR");
    const alsoEuros = priced("loff_ns", "nausys", 460_000, "EUR");
    const elsewhere = priced("loff_x", "mock", 1, "HRK");
    const result = pickWinner([inEuros, alsoEuros, elsewhere], { preferredCurrency: "EUR" });
    expect(result.winner?.offerId).toBe("loff_ns");
    expect(result.currencyMismatch).toBe(true);
  });

  it("abandons price rather than converting when no offer quotes the listing's currency", () => {
    // A number neither vendor agreed to is worse than no comparison at all, so the
    // preference order decides and the mismatch is reported.
    const first = priced("loff_ns", "nausys", 1, "HRK");
    const second = priced("loff_bm", "booking_manager", 900_000, "USD");
    const result = pickWinner([first, second], { preferredCurrency: "EUR" });
    expect(result.winner?.providerCode).toBe("booking_manager");
    expect(result.currencyMismatch).toBe(true);
  });

  it("puts a provider the preference does not name last", () => {
    const stranger = priced("loff_x", "some_new_vendor", 500_000);
    const tied = priced("loff_ns", "nausys", 500_000);
    expect(pickWinner([stranger, tied]).winner?.offerId).toBe("loff_ns");
  });

  it("chooses the same offer whatever order the answers arrive in", () => {
    const forwards = pickWinner([bookingManager, nausys]).winner?.offerId;
    const backwards = pickWinner([nausys, bookingManager]).winner?.offerId;
    expect(forwards).toBe(backwards);
  });
});

describe("pickWinner on the charter rate", () => {
  /*
   * The example the client was shown, and the trade they are being asked to confirm: Booking
   * Manager is 100 cheaper on the rate a visitor compares between sites, and 150 dearer once
   * the mandatory fees are added. The switch decides which of those two facts wins.
   */
  const bookingManager = priced("loff_bm", "booking_manager", 510_000, "EUR", {
    baseMinor: 450_000,
    obligatoryMinor: 60_000,
  });
  const nausys = priced("loff_ns", "nausys", 495_000, "EUR", {
    baseMinor: 460_000,
    obligatoryMinor: 35_000,
  });

  it("sells the cheaper all-in total by default, which is today's behaviour", () => {
    expect(pickWinner([bookingManager, nausys]).winner?.offerId).toBe("loff_ns");
  });

  it("sells the cheaper rate once told to rank on it, even though the guest pays more", () => {
    const result = pickWinner([bookingManager, nausys], { rankOn: "base" });
    expect(result.winner?.offerId).toBe("loff_bm");
    expect(result.winner?.totalMinor).toBeGreaterThan(
      nausys.outcome === "priced" ? nausys.totalMinor : 0,
    );
  });

  it("settles an equal rate on the lighter obligatory extras", () => {
    const heavy = priced("loff_bm", "booking_manager", 520_000, "EUR", {
      baseMinor: 450_000,
      obligatoryMinor: 70_000,
    });
    const light = priced("loff_ns", "nausys", 480_000, "EUR", {
      baseMinor: 450_000,
      obligatoryMinor: 30_000,
    });
    expect(pickWinner([heavy, light], { rankOn: "base" }).winner?.offerId).toBe("loff_ns");
  });
});

describe("pickWinner on commission", () => {
  it("earns more from an offer that is otherwise identical", () => {
    const lean = priced("loff_bm", "booking_manager", 500_000, "EUR", { commissionPct: 10 });
    const rich = priced("loff_ns", "nausys", 500_000, "EUR", { commissionPct: 18 });
    expect(pickWinner([lean, rich]).winner?.offerId).toBe("loff_ns");
  });

  it("never lets commission outrank the price", () => {
    /* The agreement is explicit that our margin may not be why a visitor sees a dearer boat. */
    const dearButLucrative = priced("loff_bm", "booking_manager", 560_000, "EUR", {
      commissionPct: 25,
    });
    const cheapAndLean = priced("loff_ns", "nausys", 500_000, "EUR", { commissionPct: 2 });
    expect(pickWinner([dearButLucrative, cheapAndLean]).winner?.offerId).toBe("loff_ns");
  });

  it("decides nothing while no rates have been entered", () => {
    const tied = priced("loff_ns", "nausys", 500_000);
    const alsoTied = priced("loff_bm", "booking_manager", 500_000);
    expect(pickWinner([tied, alsoTied]).winner?.providerCode).toBe("booking_manager");
  });

  it("leaves commission out when the two vendors quote different currencies", () => {
    /* Money steps stand or fall together: a pair nobody can compare on price is a pair
       nobody can compare on what a percentage of that price earns either. */
    const lucrative = priced("loff_ns", "nausys", 1, "HRK", { commissionPct: 30 });
    const other = priced("loff_bm", "booking_manager", 900_000, "USD", { commissionPct: 1 });
    const result = pickWinner([lucrative, other], { preferredCurrency: "EUR" });
    expect(result.winner?.providerCode).toBe("booking_manager");
  });
});

describe("pickWinner on reliability", () => {
  const flaky = priced("loff_bm", "booking_manager", 500_000, "EUR", { reliability: 0.9 });
  const steady = priced("loff_ns", "nausys", 500_000, "EUR", { reliability: 0.99 });

  it("ignores it until it is switched on", () => {
    expect(pickWinner([flaky, steady]).winner?.providerCode).toBe("booking_manager");
  });

  it("prefers the vendor that answers more often once it is", () => {
    expect(pickWinner([flaky, steady], { useReliability: true }).winner?.offerId).toBe("loff_ns");
  });

  it("skips the step where either vendor has no measurement yet", () => {
    const unmeasured = priced("loff_ns", "nausys", 500_000, "EUR", { reliability: null });
    const result = pickWinner([unmeasured, flaky], { useReliability: true });
    expect(result.winner?.providerCode).toBe("booking_manager");
  });
});
