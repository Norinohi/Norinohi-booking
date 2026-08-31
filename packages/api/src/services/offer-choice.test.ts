import { describe, expect, it } from "vitest";

import { type OfferQuoteResult, pickWinner } from "./offer-choice";

const priced = (
  offerId: string,
  providerCode: string,
  totalMinor: number,
  currency = "EUR",
): OfferQuoteResult => ({ outcome: "priced", offerId, providerCode, totalMinor, currency });

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
