import { describe, expect, it } from "vitest";

import { AMENITY_GROUPS, amenityGroupFor, groupAmenities } from "./amenity-groups";

describe("amenityGroupFor", () => {
  it("files an amenity under its vendor category", () => {
    expect(amenityGroupFor("Chart plotter", ["Navigation"])).toBe("navigation-and-safety");
    expect(amenityGroupFor("Oven", ["Galley"])).toBe("galley");
    expect(amenityGroupFor("Lazy jack", ["Sails"])).toBe("deck-and-cockpit");
  });

  it("reads a shouted or punctuated category the same as its plain spelling", () => {
    expect(amenityGroupFor("Solar panel", ["DECK EQUIPMENT"])).toBe("deck-and-cockpit");
    expect(amenityGroupFor("Outboard engine", ["Deck / Cockpit"])).toBe("deck-and-cockpit");
  });

  it("ignores the vendors' catch-all categories", () => {
    /* NauSYS files Autopilot under both, and which row survives the fold is decided by name
       order rather than by anything meaningful. */
    expect(amenityGroupFor("Autopilot", ["Equipment", "Navigation"])).toBe("navigation-and-safety");
    expect(amenityGroupFor("Holding tank", ["Equipment"])).toBe("systems-and-power");
  });

  it("prefers the override where the two vendors disagree across groups", () => {
    expect(amenityGroupFor("Solar panels", ["Deck", "Yacht electrics"])).toBe("systems-and-power");
    expect(amenityGroupFor("Dishwasher", ["Comfort", "Galley"])).toBe("galley");
  });

  it("matches an override however the vendor spells it", () => {
    expect(amenityGroupFor("wi-fi & internet", [])).toBe("entertainment-and-water-toys");
    expect(amenityGroupFor("Wi-Fi and Internet", ["Comfort"])).toBe("entertainment-and-water-toys");
  });

  it("falls back to the earlier heading when an unlisted amenity spans two groups", () => {
    expect(amenityGroupFor("Something new", ["Galley", "Safety"])).toBe("navigation-and-safety");
  });

  it("puts what the vendors file as equipment without it being equipment under other", () => {
    expect(amenityGroupFor("Hull colour: BLUE", ["Additional"])).toBe("other");
    expect(amenityGroupFor("Anything", [])).toBe("other");
  });
});

describe("groupAmenities", () => {
  it("returns the groups in display order and drops the empty ones", () => {
    const grouped = groupAmenities([
      { code: "oven", group: "galley" as const },
      { code: "vhf", group: "navigation-and-safety" as const },
      { code: "sink", group: "galley" as const },
    ]);

    expect(grouped.map((entry) => entry.group)).toEqual(["navigation-and-safety", "galley"]);
    expect(grouped[1]?.amenities.map((item) => item.code)).toEqual(["oven", "sink"]);
  });

  it("ends on the bucket that has no promise to keep", () => {
    expect(AMENITY_GROUPS.at(-1)).toBe("other");
  });
});
