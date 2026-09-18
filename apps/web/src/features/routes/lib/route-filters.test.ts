import { describe, expect, it } from "vitest";

import type { MapRoute } from "../api/queries";
import { countryOptions, lengthOf, matchesFilters, type RouteFilters } from "./route-filters";

const route = (overrides: Partial<MapRoute> = {}): MapRoute => ({
  id: "srt_1",
  slug: "central-dalmatia",
  title: "Central Dalmatia",
  description: null,
  nights: 7,
  kind: "seven_days",
  difficulty: "easy",
  imageUrl: null,
  cloudinaryId: null,
  placeLabel: "Split · Dalmatia · Croatia",
  countryValue: "croatia",
  countryLabel: "Croatia",
  sailingAreaValue: null,
  marinaValue: "split",
  stops: [
    { name: "Split", lat: 43.5, lng: 16.4, note: null },
    { name: "Šibenik", lat: 43.7, lng: 15.9, note: null },
  ],
  ...overrides,
});

const none: RouteFilters = { q: "", country: null, length: null, level: null };

describe("lengthOf", () => {
  it("buckets nights the way a visitor plans a holiday", () => {
    expect([3, 6, 7, 10, 14].map(lengthOf)).toEqual(["short", "short", "week", "long", "long"]);
  });
});

describe("matchesFilters", () => {
  it("keeps every route with no filters", () => {
    expect(matchesFilters(route(), none)).toBe(true);
  });

  it("finds a route by a stop it calls at, ignoring case and accents", () => {
    expect(matchesFilters(route(), { ...none, q: "SIBENIK" })).toBe(true);
    expect(matchesFilters(route(), { ...none, q: "hvar" })).toBe(false);
  });

  it("applies country, length and level together", () => {
    const filters: RouteFilters = { q: "", country: "croatia", length: "week", level: "easy" };
    expect(matchesFilters(route(), filters)).toBe(true);
    expect(matchesFilters(route({ nights: 10 }), filters)).toBe(false);
    expect(matchesFilters(route({ countryValue: "greece" }), filters)).toBe(false);
    expect(matchesFilters(route({ difficulty: null }), filters)).toBe(false);
  });
});

describe("countryOptions", () => {
  it("lists each country once, by its translated label", () => {
    const options = countryOptions([
      route(),
      route({ id: "srt_2" }),
      route({ id: "srt_3", countryValue: "greece", countryLabel: "Греція" }),
      route({ id: "srt_4", countryValue: null, countryLabel: null }),
    ]);
    expect(options).toEqual([
      { value: "croatia", label: "Croatia" },
      { value: "greece", label: "Греція" },
    ]);
  });
});
