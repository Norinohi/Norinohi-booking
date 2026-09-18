import type { NearestBase } from "@yacht-charter/db/geo/nearest-marinas";
import { describe, expect, it } from "vitest";

import { mergeBasesByName } from "./route-marinas";

const base = (name: string, distanceKm: number, listingCount: number): NearestBase => ({
  id: `${name}-${distanceKm}`,
  name,
  location: name,
  city: null,
  region: "Dalmatia",
  country: "Croatia",
  countryCode: "HR",
  lat: 43.5 + distanceKm / 100,
  lng: 16.4,
  distanceKm,
  listingCount,
});

describe("mergeBasesByName", () => {
  it("folds two vendors' bases with one name into one marina at the nearer position", () => {
    const merged = mergeBasesByName(
      [base("ACI Marina Split", 0.2, 30), base("Trogir", 20, 5), base("ACI Marina Split", 0.6, 12)],
      8,
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      name: "ACI Marina Split",
      distanceKm: 0.2,
      listingCount: 42,
    });
    expect(merged[1]?.name).toBe("Trogir");
  });

  it("stops at the limit after merging", () => {
    const bases = ["A", "B", "C"].map((name, index) => base(name, index, 1));

    expect(mergeBasesByName(bases, 2).map((marina) => marina.name)).toEqual(["A", "B"]);
  });
});
