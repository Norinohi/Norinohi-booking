import { describe, expect, it } from "vitest";

import {
  shownPriceOf,
  priceAscSortValueOf,
  priceDescSortValueOf,
  UNPRICED_CHARTER_SORT_OFFSET,
} from "./repository";
import { recommendedSortValueOf } from "./pricing-sql";

/**
 * `shownPriceOf` is the keyset cursor's copy of the sort SQL, so these pin the rules the two sides
 * have to agree on. A cursor computed from a different number than the ORDER BY either skips rows
 * at a page boundary or serves them twice.
 */
type PricedRow = Parameters<typeof priceAscSortValueOf>[0];

function doc(over: Partial<PricedRow>): PricedRow {
  return {
    priceFromMinorEur: null,
    basePriceFromMinorEur: null,
    priceIsFrom: false,
    bookableFrom: null,
    ...over,
  };
}

const inDays = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

describe("shownPriceOf", () => {
  it("has no answer for a listing with no price", () => {
    expect(shownPriceOf(doc({ priceFromMinorEur: null }))).toBeNull();
  });

  /* Sorted per night, a 271,200 week sat below a 67,200 single day in "dearest first". */
  it("is the card's headline figure whatever length of charter it prices", () => {
    expect(shownPriceOf(doc({ priceFromMinorEur: 2_025_000, bookableFrom: inDays(12) }))).toBe(
      2_025_000,
    );
  });
});

describe("shownPriceOf on the charter rate", () => {
  /*
   * The basis has to reach this function as well as the ORDER BY: the SQL ordering on one column
   * while the cursor carries the other puts the page boundary in the wrong place.
   */
  const row = doc({ priceFromMinorEur: 2_100_000, basePriceFromMinorEur: 1_400_000 });

  it("reads the all-in figure by default", () => {
    expect(shownPriceOf(row)).toBe(2_100_000);
  });

  it("reads the rate when asked for it", () => {
    expect(shownPriceOf(row, "base")).toBe(1_400_000);
  });

  it("falls back to the total where the rate is missing, as the card does", () => {
    const unconverted = doc({ priceFromMinorEur: 700_000, basePriceFromMinorEur: null });
    expect(shownPriceOf(unconverted, "base")).toBe(700_000);
  });

  it("treats a rate of nought as no rate rather than as a free boat", () => {
    const noRate = doc({ priceFromMinorEur: 700_000, basePriceFromMinorEur: 0 });
    expect(shownPriceOf(noRate, "base")).toBe(700_000);
  });

  it("has no answer at all where neither figure is comparable", () => {
    expect(shownPriceOf(doc({ priceFromMinorEur: null }), "base")).toBeNull();
  });
});

describe("a nominal charter rate", () => {
  /* Angelmiles Maxus 35: EUR 1 boat rate, EUR 386 all-in. Read as a price it sorted first. */
  const nominal = doc({ priceFromMinorEur: 38_600, basePriceFromMinorEur: 100 });

  it("is ignored in favour of the all-in figure", () => {
    expect(shownPriceOf(nominal, "base")).toBe(38_600);
  });

  it("still counts when it is a real share of the total", () => {
    expect(shownPriceOf({ ...nominal, basePriceFromMinorEur: 30_000 }, "base")).toBe(30_000);
  });
});

describe("priceAscSortValueOf", () => {
  const priced = doc({ priceFromMinorEur: 700_000, bookableFrom: inDays(12) });

  it("orders a priced charter by its shown price", () => {
    expect(priceAscSortValueOf(priced)).toBe(700_000);
  });

  /* Paxos Bavaria 46: a EUR 200 "week" with nothing to sell headed "cheapest first" in Greece. */
  it("moves a seasonal floor behind every priced charter", () => {
    const floor = doc({ priceFromMinorEur: 20_000, priceIsFrom: true });
    expect(priceAscSortValueOf(floor)).toBe(20_000 + UNPRICED_CHARTER_SORT_OFFSET);
    expect(priceAscSortValueOf(floor)).toBeGreaterThan(priceAscSortValueOf(priced));
  });

  it("moves a lapsed charter behind them too", () => {
    const lapsed = doc({ priceFromMinorEur: 39_200, bookableFrom: inDays(-2) });
    expect(priceAscSortValueOf(lapsed)).toBeGreaterThan(UNPRICED_CHARTER_SORT_OFFSET);
  });
});

describe("sort values on a dated search", () => {
  const week = { bookableFrom: inDays(12) };
  const forDates = doc({ ...week, priceFromMinorEur: 720_000, pricedForDates: true });
  const otherWeek = doc({ ...week, priceFromMinorEur: 700_000, pricedForDates: false });

  /* A EUR 7,000 week in September sorted above a EUR 7,200 quote for the dates asked for. */
  it("puts every price for the searched dates ahead of a cheaper other week", () => {
    expect(priceAscSortValueOf(forDates)).toBeLessThan(priceAscSortValueOf(otherWeek));
    expect(priceDescSortValueOf(forDates)).toBeGreaterThan(priceDescSortValueOf(otherWeek));
  });

  it("leaves an undated search's values as they were", () => {
    const undated = doc({ ...week, priceFromMinorEur: 700_000 });
    expect(priceAscSortValueOf(undated)).toBe(700_000);
    expect(priceDescSortValueOf(undated)).toBe(700_000);
  });
});

describe("recommendedSortValueOf", () => {
  const rated = { priceIsFrom: false, rating: "4.50" };

  it("ranks a weekly reference below every price and above no figure, whatever the stars", () => {
    const nearbyEstimate = recommendedSortValueOf({
      priceIsFrom: false,
      rating: "0.00",
      pricedForDates: true,
      priceSource: "price-list-estimate",
      pricedForNearbyDates: true,
    });
    const reference = (rating: string) =>
      recommendedSortValueOf({
        priceIsFrom: false,
        rating,
        pricedForDates: false,
        priceSource: null,
        weeklyRateMinor: 700_000,
      });
    const none = recommendedSortValueOf({
      priceIsFrom: false,
      rating: "5.00",
      pricedForDates: false,
      priceSource: null,
      weeklyRateMinor: null,
    });
    expect(nearbyEstimate).toBeGreaterThan(reference("5.00"));
    expect(reference("0.00")).toBeGreaterThan(none);
  });

  it("ranks a dated search's vendor price, then its list rate, then the rest", () => {
    const vendor = recommendedSortValueOf({
      ...rated,
      pricedForDates: true,
      priceSource: "vendor",
    });
    const list = recommendedSortValueOf({
      ...rated,
      rating: "5.00",
      pricedForDates: true,
      priceSource: "price-list",
    });
    const none = recommendedSortValueOf({ ...rated, pricedForDates: false, priceSource: null });
    expect(vendor).toBeGreaterThan(list);
    expect(list).toBeGreaterThan(none);
  });

  it("ranks a list rate above an estimate from the list, and an estimate above no price", () => {
    const list = recommendedSortValueOf({
      ...rated,
      rating: "0.00",
      pricedForDates: true,
      priceSource: "price-list",
    });
    const estimate = recommendedSortValueOf({
      ...rated,
      rating: "5.00",
      pricedForDates: true,
      priceSource: "price-list-estimate",
    });
    const none = recommendedSortValueOf({
      ...rated,
      rating: "5.00",
      pricedForDates: false,
      priceSource: null,
    });
    expect(list).toBeGreaterThan(estimate);
    expect(estimate).toBeGreaterThan(none);
  });

  it("ranks any price for the dates asked for above any for the nearby charter shown", () => {
    const estimateAsked = recommendedSortValueOf({
      ...rated,
      rating: "0.00",
      pricedForDates: true,
      pricedForNearbyDates: false,
      priceSource: "price-list-estimate",
    });
    const vendorNearby = recommendedSortValueOf({
      ...rated,
      rating: "5.00",
      pricedForDates: true,
      pricedForNearbyDates: true,
      priceSource: "vendor",
    });
    const estimateNearby = recommendedSortValueOf({
      ...rated,
      rating: "5.00",
      pricedForDates: true,
      pricedForNearbyDates: true,
      priceSource: "price-list-estimate",
    });
    const none = recommendedSortValueOf({ ...rated, rating: "5.00", pricedForDates: false });
    expect(estimateAsked).toBeGreaterThan(vendorNearby);
    expect(estimateNearby).toBeGreaterThan(none);
  });

  it("ranks a price for the dates asked for above one for the nearby week shown instead", () => {
    const listAsked = recommendedSortValueOf({
      ...rated,
      pricedForDates: true,
      pricedForNearbyDates: false,
      priceSource: "price-list",
    });
    const vendorNearby = recommendedSortValueOf({
      ...rated,
      rating: "5.00",
      pricedForDates: true,
      pricedForNearbyDates: true,
      priceSource: "vendor",
    });
    const listNearby = recommendedSortValueOf({
      ...rated,
      rating: "5.00",
      pricedForDates: true,
      pricedForNearbyDates: true,
      priceSource: "price-list",
    });
    const none = recommendedSortValueOf({
      ...rated,
      rating: "5.00",
      pricedForDates: false,
      pricedForNearbyDates: false,
      priceSource: null,
    });
    expect(listAsked).toBeGreaterThan(vendorNearby);
    expect(vendorNearby).toBeGreaterThan(listNearby);
    expect(listNearby).toBeGreaterThan(none);
  });

  it("leaves an undated search's values as they were", () => {
    expect(recommendedSortValueOf(rated)).toBe(14.5);
    expect(recommendedSortValueOf({ ...rated, priceIsFrom: true })).toBe(4.5);
  });
});
