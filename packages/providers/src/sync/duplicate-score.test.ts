import { describe, expect, it } from "vitest";

import { scoreDuplicatePair, yachtNameKey } from "./duplicate-score";
import type { DuplicateSideFacts } from "./duplicate-score";

const side = (overrides: Partial<DuplicateSideFacts> = {}): DuplicateSideFacts => ({
  title: "Airbender Sun Odyssey 449",
  lengthM: 13.76,
  cabins: 4,
  berths: 10,
  heads: 2,
  homeBaseId: "bse_lavrion",
  locationId: "loc_athens",
  lat: 37.7136,
  lng: 24.0574,
  builderId: "bld_jeanneau",
  operatorName: "CV Yachts",
  ...overrides,
});

describe("yachtNameKey", () => {
  it("strips the model out of the title", () => {
    expect(yachtNameKey("Airbender Sun Odyssey 449", "Sun Odyssey 449")).toBe("airbender");
  });

  it("keeps the title when no model is known", () => {
    expect(yachtNameKey("Airbender", null)).toBe("airbender");
  });

  it("ignores punctuation, case and spacing", () => {
    expect(yachtNameKey("SEA-Star II (Bali 4.5)", "Bali 4.5")).toBe(
      yachtNameKey("sea star ii", null),
    );
  });

  it("refuses a name too short to mean anything", () => {
    expect(yachtNameKey("Sun Odyssey 449", "Sun Odyssey 449")).toBeNull();
  });
});

describe("scoreDuplicatePair", () => {
  it("scores a full agreement at 1", () => {
    const score = scoreDuplicatePair({ modelName: "Sun Odyssey 449", a: side(), b: side() });

    expect(score.confidence).toBe(1);
    expect(score.signals.matchedOn).toBe("name+model+year");
    expect(score.signals.name).toBe("airbender");
    expect(score.signals.differed).toEqual([]);
  });

  it("keeps two sister ships in different countries near the floor", () => {
    const score = scoreDuplicatePair({
      modelName: "Sun Odyssey 449",
      a: side(),
      b: side({
        title: "Calia Sun Odyssey 449",
        lengthM: 13.34,
        berths: 7,
        homeBaseId: "bse_blue_lagoon",
        locationId: "loc_svg",
        lat: 13.1339,
        lng: -61.2213,
        operatorName: "Horizon Yacht Charters",
      }),
    });

    expect(score.signals.matchedOn).toBe("model+year");
    expect(score.signals.agreed).toEqual(["cabins", "heads", "builder"]);
    expect(score.confidence).toBeCloseTo(0.42, 4);
  });

  it("calls the same boat at the same base a base match when the names disagree", () => {
    const score = scoreDuplicatePair({
      modelName: "Sun Odyssey 449",
      a: side(),
      b: side({ title: "Poseidon Sun Odyssey 449" }),
    });

    expect(score.signals.matchedOn).toBe("base+model+year");
    expect(score.signals.differed).toContain("name");
    expect(score.signals.agreed).toContain("base");
    /* Everything but the name: 1 - 0.30, and location is not counted beside a base match. */
    expect(score.confidence).toBeCloseTo(0.7, 4);
  });

  it("reads two marinas an hour apart as the same area, not the same berth", () => {
    const score = scoreDuplicatePair({
      modelName: "Sun Odyssey 449",
      a: side(),
      /* Alimos, ~35 km up the coast from Lavrion. */
      b: side({ homeBaseId: "bse_alimos", lat: 37.9111, lng: 23.7 }),
    });

    expect(score.signals.differed).toContain("base");
    expect(score.signals.agreed).toContain("area");
  });

  it("calls two differently named rows at the same coordinates one berth", () => {
    const score = scoreDuplicatePair({
      modelName: "Sun Odyssey 449",
      a: side(),
      b: side({ homeBaseId: "bse_lavrion_olympic", lat: 37.7141, lng: 24.0592 }),
    });

    expect(score.signals.agreed).toContain("base");
    expect(score.signals.differed).not.toContain("area");
    expect(score.confidence).toBe(1);
  });

  it("treats a missing value as neither agreement nor disagreement", () => {
    const score = scoreDuplicatePair({
      modelName: "Sun Odyssey 449",
      a: side({ heads: null }),
      b: side(),
    });

    expect(score.signals.agreed).not.toContain("heads");
    expect(score.signals.differed).not.toContain("heads");
    expect(score.confidence).toBeCloseTo(0.96, 4);
  });

  it("allows a few centimetres of drift in the stated length", () => {
    const score = scoreDuplicatePair({
      modelName: "Sun Odyssey 449",
      a: side({ lengthM: 13.76 }),
      b: side({ lengthM: 13.7 }),
    });

    expect(score.signals.agreed).toContain("length");
  });
});
