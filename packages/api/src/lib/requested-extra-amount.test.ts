import { describe, expect, it } from "vitest";

import { requestedExtraAmountMinor } from "./requested-extra-amount";

const week = { nights: 7, guests: 4, baseMinor: 400_000 };
const rate = (priceMeasure: string | null, priceMinor = 1_000) => ({
  priceMinor,
  priceMeasure,
  percentage: null,
  included: false,
});

describe("requestedExtraAmountMinor", () => {
  it.each([
    ["per_booking", 1_000],
    ["per booking", 1_000],
    [null, 1_000],
    ["per_week", 1_000],
    ["per week + food", 1_000],
    ["per_night", 7_000],
    ["per day", 7_000],
    ["per person", 4_000],
    ["one-way / person", 4_000],
    ["per week/ person", 4_000],
    ["per guest/day", 28_000],
    ["per person / night", 28_000],
  ])("prices %s over a week for four", (measure, expected) => {
    expect(requestedExtraAmountMinor(rate(measure), week)).toBe(expected);
  });

  it("charges a started week in full", () => {
    expect(requestedExtraAmountMinor(rate("per_week"), { ...week, nights: 10 })).toBe(2_000);
    expect(requestedExtraAmountMinor(rate("per_week"), { ...week, nights: 3 })).toBe(1_000);
  });

  it("takes a percentage of the charter", () => {
    expect(requestedExtraAmountMinor({ ...rate(null, 0), percentage: 0.1 }, week)).toBe(40_000);
  });

  it("adds nothing it cannot count or that has no rate", () => {
    expect(requestedExtraAmountMinor(rate("per_hour"), week)).toBeNull();
    expect(requestedExtraAmountMinor(rate("per nautical mile"), week)).toBeNull();
    expect(requestedExtraAmountMinor(rate("per_booking", 0), week)).toBeNull();
    expect(requestedExtraAmountMinor({ ...rate("per_booking"), included: true }, week)).toBeNull();
  });
});

describe("a measure the provider could not name", () => {
  it("stays a request rather than a single charge", () => {
    expect(
      requestedExtraAmountMinor(
        { priceMinor: 8_000, priceMeasure: "per unit", percentage: null, included: false },
        { nights: 7, guests: 4, baseMinor: 500_000 },
      ),
    ).toBeNull();
  });
});
