import { describe, expect, it } from "vitest";

import { DEFAULT_FILTERS, type FiltersState } from "@/components/shared/form/filters/lib/state";

import { toSearchInput } from "./to-search-input";

/* Slider limits as the facets would deliver them; a range at its limits is no constraint. */
const DEFAULTS: FiltersState = {
  ...DEFAULT_FILTERS,
  length: [20, 515],
  cabins: [1, 8],
  berths: [2, 16],
  bathrooms: [1, 6],
  price: [500, 400_000],
  guestRating: [0, 5],
};

type SearchOptions = Parameters<typeof toSearchInput>[2];

const OPTS: SearchOptions = { sort: "recommended", page: 1, locale: "en" };

const search = (changes: Partial<FiltersState>, opts: Partial<SearchOptions> = {}) =>
  toSearchInput({ ...DEFAULTS, ...changes }, DEFAULTS, { ...OPTS, ...opts });

describe("toSearchInput", () => {
  it("sends only the fixed fields for untouched filters", () => {
    expect(search({})).toEqual({ currency: "EUR", sort: "recommended", page: 1, locale: "en" });
  });

  it("sends a named duration as a number and omits any", () => {
    expect(search({ duration: "10" }).duration).toBe(10);
    expect(search({ duration: "any" })).not.toHaveProperty("duration");
  });

  it("sends date flexibility only with a start date", () => {
    expect(search({ dateFlexibility: "1-week" })).not.toHaveProperty("dateFlexibility");
    expect(search({ startDate: "2026-07-04", dateFlexibility: "1-week" })).toMatchObject({
      startDate: "2026-07-04",
      dateFlexibility: "1-week",
    });
  });

  it("drops a flexibility the contract does not know", () => {
    const input = search({ startDate: "2026-07-04", dateFlexibility: "forever" });

    expect(input.dateFlexibility).toBeUndefined();
  });

  it("sends only the moved end of a range", () => {
    const input = search({ cabins: [3, 8] });

    expect(input.minCabins).toBe(3);
    expect(input.maxCabins).toBeUndefined();
  });

  it("converts feet to metres and whole currency to minor units", () => {
    const input = search({ length: [30, 50], price: [1000, 2000] });

    expect(input.minLength).toBeCloseTo(9.144);
    expect(input.maxLength).toBeCloseTo(15.24);
    expect(input.minPriceMinor).toBe(100_000);
    expect(input.maxPriceMinor).toBe(200_000);
  });

  it("takes the larger of the berths slider and a planner's minimum", () => {
    expect(search({ berths: [6, 16], minBerths: 4 }).minBerths).toBe(6);
    expect(search({ berths: [2, 16], minBerths: 8 }).minBerths).toBe(8);
  });

  it("sends years as numbers and flags only when set", () => {
    const input = search({ yearFrom: "2015", yearTo: "any", petsAllowed: true });

    expect(input.yearFrom).toBe(2015);
    expect(input).not.toHaveProperty("yearTo");
    expect(input.petsAllowed).toBe(true);
    expect(input).not.toHaveProperty("bestValue");
  });

  it("passes multi-selects and a picked price basis through", () => {
    const input = search({ country: ["croatia"], crew: [] }, { priceBasis: "all_in" });

    expect(input.country).toEqual(["croatia"]);
    expect(input).not.toHaveProperty("crew");
    expect(input.priceBasis).toBe("all_in");
  });
});
