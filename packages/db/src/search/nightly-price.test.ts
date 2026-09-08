import { describe, expect, it } from "vitest";

import { nightlyPriceOf } from "./repository";

/**
 * `nightlyPriceOf` is the keyset cursor's copy of the `pricedNights` SQL, so these pin the two
 * rules the two sides have to agree on. A cursor computed from a different number than the
 * ORDER BY either skips rows at a page boundary or serves them twice.
 */
type PricedRow = Parameters<typeof nightlyPriceOf>[0];

function doc(over: Partial<PricedRow>): PricedRow {
  return {
    priceFromMinorEur: null,
    basePriceFromMinorEur: null,
    priceIsFrom: false,
    bookableFrom: null,
    bookableTo: null,
    ...over,
  };
}

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe("nightlyPriceOf", () => {
  it("has no answer for a listing with no price", () => {
    expect(nightlyPriceOf(doc({ priceFromMinorEur: null }))).toBeNull();
  });

  it("divides by the advertised charter's own nights", () => {
    /* 5 nights at 20,250.00 is 4,050.00 a night, not 20,250.00. */
    expect(
      nightlyPriceOf(
        doc({
          priceFromMinorEur: 2_025_000,
          bookableFrom: inDays(12),
          bookableTo: inDays(17),
        }),
      ),
    ).toBe(405_000);
  });

  /*
   * Casanova (Booking Manager, 74484419) advertises a single night against a 41,000 EUR seasonal
   * floor. Divided by that night it sorted as the second most expensive yacht in Croatia.
   */
  it("treats a seasonal floor as a week however short the advertised charter", () => {
    expect(
      nightlyPriceOf(
        doc({
          priceFromMinorEur: 4_100_000,
          priceIsFrom: true,
          bookableFrom: inDays(26),
          bookableTo: inDays(27),
        }),
      ),
    ).toBe(585_714);
  });

  it("falls back to a week once the advertised charter is too close to sell", () => {
    const price = 700_000;
    expect(nightlyPriceOf(doc({ priceFromMinorEur: price, bookableFrom: inDays(-3) }))).toBe(
      Math.round(price / 7),
    );
    expect(nightlyPriceOf(doc({ priceFromMinorEur: price }))).toBe(Math.round(price / 7));
  });
});

describe("nightlyPriceOf on the charter rate", () => {
  /*
   * The basis has to reach this function as well as the ORDER BY. It did not at first, and the
   * failure is invisible in a page of results: the SQL orders on one column while the cursor
   * carries the other, so the boundary between page one and page two lands in the wrong place.
   */
  const row = doc({
    priceFromMinorEur: 2_100_000,
    basePriceFromMinorEur: 1_400_000,
    bookableFrom: inDays(12),
    bookableTo: inDays(19),
  });

  it("divides the all-in figure by default", () => {
    expect(nightlyPriceOf(row)).toBe(300_000);
  });

  it("divides the rate when asked for it", () => {
    expect(nightlyPriceOf(row, "base")).toBe(200_000);
  });

  it("falls back to the total where the rate is missing, as the card does", () => {
    const unconverted = doc({ priceFromMinorEur: 700_000, basePriceFromMinorEur: null });
    expect(nightlyPriceOf(unconverted, "base")).toBe(100_000);
  });

  it("treats a rate of nought as no rate rather than as a free boat", () => {
    /* Two vendors publish real obligatory fees against a rate of zero. Read literally they
       sorted to the top of "cheapest first" while their cards showed what they actually cost. */
    const noRate = doc({ priceFromMinorEur: 700_000, basePriceFromMinorEur: 0 });
    expect(nightlyPriceOf(noRate, "base")).toBe(100_000);
  });

  it("has no answer at all where neither figure is comparable", () => {
    expect(nightlyPriceOf(doc({ priceFromMinorEur: null }), "base")).toBeNull();
  });
});
