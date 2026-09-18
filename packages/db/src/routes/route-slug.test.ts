import { describe, expect, it } from "vitest";

import { routeSlug, uniqueSlug } from "./route-slug";

describe("routeSlug", () => {
  it("folds diacritics and spells out the letters NFKD leaves whole", () => {
    expect(routeSlug("Göcek & Gulf of Fethiye")).toBe("gocek-gulf-of-fethiye");
    expect(routeSlug("Îles d'Hyères Classic")).toBe("iles-dhyeres-classic");
    expect(routeSlug("Sognefjord and Nærøyfjord")).toBe("sognefjord-and-naeroyfjord");
    expect(routeSlug("Brač, Hvar and Korčula Loop")).toBe("brac-hvar-and-korcula-loop");
  });

  it("falls back for a title with no Latin letters", () => {
    expect(routeSlug("Центральна Далмація")).toBe("route");
  });
});

describe("uniqueSlug", () => {
  it("numbers a slug that is taken, from 2", () => {
    expect(uniqueSlug("ionian", new Set())).toBe("ionian");
    expect(uniqueSlug("ionian", new Set(["ionian"]))).toBe("ionian-2");
    expect(uniqueSlug("ionian", new Set(["ionian", "ionian-2"]))).toBe("ionian-3");
  });
});
