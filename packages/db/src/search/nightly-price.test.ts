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
