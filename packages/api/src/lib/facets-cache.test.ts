import type { ListingFacets } from "@yacht-charter/db/search";
import { describe, expect, it } from "vitest";

import { FACETS_TTL_MS, compactFacetOption, createFacetsCache } from "./facets-cache";

function facetsNamed(label: string): ListingFacets {
  const range = { min: 0, max: 0 };
  return {
    destinations: [label],
    categories: [],
    amenities: [],
    options: {
      countries: [],
      sailingAreas: [],
      charterCompanies: [],
      marinas: [],
      durations: [],
      dateFlexibility: [],
      boatTypes: [],
      models: [],
      crews: [],
      mainsailTypes: [],
      equipment: [],
      lengthUnits: [],
      years: [],
    },
    ranges: {
      length: range,
      cabins: range,
      berths: range,
      bathrooms: range,
      price: { minMinor: 0, maxMinor: 0, currency: "EUR" },
      boatAge: range,
      year: range,
      guestRating: range,
    },
    toggles: {
      underTemporaryBooking: false,
      depositInsurance: false,
      petsAllowed: false,
      bestValue: false,
    },
    priceRange: { minMinor: 0, maxMinor: 0, currency: "EUR" },
  };
}

describe("compactFacetOption", () => {
  it("drops nulls and the default hover flag, and keeps every set field", () => {
    expect(
      compactFacetOption({
        value: "3d-tender",
        label: "3D Tender",
        count: 1,
        imageUrl: null,
        hoverImageUrl: null,
        gridUsesHoverImage: true,
        cloudinaryId: null,
        description: null,
        priceFromMinor: 110100,
        pricePerPersonWeekMinor: null,
        currency: "EUR",
        popularRank: null,
        featuredRank: null,
      }),
    ).toEqual({
      value: "3d-tender",
      label: "3D Tender",
      count: 1,
      priceFromMinor: 110100,
      currency: "EUR",
    });

    const curated = {
      value: "croatia",
      label: "Croatia",
      count: 0,
      imageUrl: "/a.webp",
      hoverImageUrl: "/b.webp",
      gridUsesHoverImage: false,
      cloudinaryId: "legacy",
      description: "Islands",
      priceFromMinor: 0,
      pricePerPersonWeekMinor: 5,
      currency: "EUR",
      popularRank: 1,
      featuredRank: 2,
    };
    expect(compactFacetOption(curated)).toEqual(curated);
  });
});

describe("createFacetsCache", () => {
  it("serves one read per key until the entry expires", async () => {
    let time = 0;
    const cache = createFacetsCache(() => time);
    let loads = 0;
    const load = async () => facetsNamed(`load ${++loads}`);

    await cache.read("uk:hr", load);
    const again = await cache.read("uk:hr", load);
    expect(again.destinations).toEqual(["load 1"]);

    time = FACETS_TTL_MS + 1;
    expect((await cache.read("uk:hr", load)).destinations).toEqual(["load 2"]);
  });

  it("keeps keys apart and forgets everything on clear", async () => {
    const cache = createFacetsCache(() => 0);
    await cache.read("uk", async () => facetsNamed("uk"));
    const de = await cache.read("de", async () => facetsNamed("de"));
    expect(de.destinations).toEqual(["de"]);

    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it("does not keep a failed read", async () => {
    const cache = createFacetsCache(() => 0);
    await expect(
      cache.read("uk", () => Promise.reject(new Error("pool exhausted"))),
    ).rejects.toThrow("pool exhausted");

    const retried = await cache.read("uk", async () => facetsNamed("retried"));
    expect(retried.destinations).toEqual(["retried"]);
  });
});
