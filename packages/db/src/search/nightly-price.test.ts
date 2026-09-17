import { describe, expect, it } from "vitest";

import {
  nightlyPriceOf,
  priceAscSortValueOf,
  priceDescSortValueOf,
  UNPRICED_CHARTER_SORT_OFFSET,
} from "./repository";
import { recommendedSortValueOf } from "./pricing-sql";

/**
 * `nightlyPriceOf` is the keyset cursor's copy of the `pricedNights` SQL, so these pin the two
 * rules the two sides have to agree on. A cursor computed from a different number than the
 * ORDER BY either skips rows at a page boundary or serves them twice.
 */
type PricedRow = Parameters<typeof priceAscSortValueOf>[0];

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

describe("a nominal charter rate", () => {
  /* Angelmiles Maxus 35: EUR 1 boat rate, EUR 386 all-in. Read as a price it sorted first. */
  const nominal = doc({
    priceFromMinorEur: 38_600,
    basePriceFromMinorEur: 100,
    bookableFrom: inDays(12),
    bookableTo: inDays(19),
  });

  it("is ignored in favour of the all-in figure", () => {
    expect(nightlyPriceOf(nominal, "base")).toBe(Math.round(38_600 / 7));
  });

  it("still counts when it is a real share of the total", () => {
    const real = doc({ ...nominal, basePriceFromMinorEur: 30_000 });
    expect(nightlyPriceOf(real, "base")).toBe(Math.round(30_000 / 7));
  });
});

describe("priceAscSortValueOf", () => {
  const priced = doc({
    priceFromMinorEur: 700_000,
    bookableFrom: inDays(12),
    bookableTo: inDays(19),
  });

  it("orders a priced charter by its nightly price", () => {
    expect(priceAscSortValueOf(priced)).toBe(100_000);
  });

  /* Paxos Bavaria 46: a EUR 200 "week" with nothing to sell headed "cheapest first" in Greece. */
  it("moves a seasonal floor behind every priced charter", () => {
    const floor = doc({ priceFromMinorEur: 20_000, priceIsFrom: true });
    expect(priceAscSortValueOf(floor)).toBe(Math.round(20_000 / 7) + UNPRICED_CHARTER_SORT_OFFSET);
    expect(priceAscSortValueOf(floor)).toBeGreaterThan(priceAscSortValueOf(priced));
  });

  it("moves a lapsed charter behind them too", () => {
    const lapsed = doc({
      priceFromMinorEur: 39_200,
      bookableFrom: inDays(-2),
      bookableTo: inDays(-1),
    });
    expect(priceAscSortValueOf(lapsed)).toBeGreaterThan(UNPRICED_CHARTER_SORT_OFFSET);
  });
});

describe("sort values on a dated search", () => {
  const week = { bookableFrom: inDays(12), bookableTo: inDays(19) };
  const forDates = doc({ ...week, priceFromMinorEur: 720_000, pricedForDates: true });
  const otherWeek = doc({ ...week, priceFromMinorEur: 700_000, pricedForDates: false });

  /* A EUR 7,000 week in September sorted above a EUR 7,200 quote for the dates asked for. */
  it("puts every price for the searched dates ahead of a cheaper other week", () => {
    expect(priceAscSortValueOf(forDates)).toBeLessThan(priceAscSortValueOf(otherWeek));
    expect(priceDescSortValueOf(forDates)).toBeGreaterThan(priceDescSortValueOf(otherWeek));
  });

  it("leaves an undated search's values as they were", () => {
    const undated = doc({ ...week, priceFromMinorEur: 700_000 });
    expect(priceAscSortValueOf(undated)).toBe(100_000);
    expect(priceDescSortValueOf(undated)).toBe(100_000);
  });
});

describe("recommendedSortValueOf", () => {
  const rated = { priceIsFrom: false, rating: "4.50" };

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
