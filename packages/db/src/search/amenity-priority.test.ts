import { describe, expect, it } from "vitest";

import { topAmenities } from "./amenity-priority";

const key = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const ranks = new Map([
  ["airconditioning", 1],
  ["generator", 2],
  ["watermaker", 3],
  ["bowthruster", 4],
  ["bimini", 14],
]);

describe("topAmenities", () => {
  it("orders by curated rank rather than by the order the boat lists them", () => {
    expect(topAmenities(["Bimini", "Generator", "Air conditioning"], ranks, key)).toEqual([
      "Air conditioning",
      "Generator",
      "Bimini",
    ]);
  });

  it("keeps the boat's own order among unranked amenities", () => {
    expect(topAmenities(["Anchor", "Bilge pump", "Bow thruster"], ranks, key)).toEqual([
      "Bow thruster",
      "Anchor",
      "Bilge pump",
    ]);
  });

  it("appends unranked amenities after ranked ones rather than dropping them", () => {
    expect(topAmenities(["Anchor", "Teak deck", "Generator"], ranks, key, 2)).toEqual([
      "Generator",
      "Anchor",
    ]);
  });

  it("falls back to the boat's order when nothing is curated", () => {
    expect(topAmenities(["Anchor", "Bimini", "Radar", "AIS", "Fridge"], new Map(), key)).toEqual([
      "Anchor",
      "Bimini",
      "Radar",
      "AIS",
    ]);
  });

  it("matches on the caller's key, so spelling and case do not split a value", () => {
    expect(topAmenities(["Radar", "AIR CONDITIONING"], ranks, key, 1)).toEqual([
      "AIR CONDITIONING",
    ]);
  });

  it("returns nothing for a limit of zero", () => {
    expect(topAmenities(["Generator"], ranks, key, 0)).toEqual([]);
  });
});
