import { describe, expect, it } from "vitest";

import { scoreDuplicatePair, worthReviewing, yachtNameKey } from "./duplicate-score";
import type { DuplicateGates, DuplicateSideFacts } from "./duplicate-score";

/* Most cases here are about the scoring, not about which gate let the pair in. */
const BOTH_GATES: DuplicateGates = { modelYear: true, nameBase: true };

const side = (overrides: Partial<DuplicateSideFacts> = {}): DuplicateSideFacts => ({
  title: "Airbender Sun Odyssey 449",
  modelId: "mdl_sun_odyssey_449",
  modelName: "Sun Odyssey 449",
  yearBuilt: 2019,
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
    const score = scoreDuplicatePair({ gates: BOTH_GATES, a: side(), b: side() });

    expect(score.confidence).toBe(1);
    expect(score.signals.matchedOn).toBe("name+model+year");
    expect(score.signals.name).toBe("airbender");
    expect(score.signals.differed).toEqual([]);
  });

  it("keeps two sister ships in different countries near the floor", () => {
    const score = scoreDuplicatePair({
      gates: BOTH_GATES,
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
    /*
     * Model and year are agreements now rather than a free 0.12 off the base weight, which is
     * exactly what two sister ships do share. The floor is unchanged: the base dropped by what
     * the two new criteria add back.
     */
    expect(score.signals.agreed).toEqual(["model", "year", "cabins", "heads", "builder"]);
    expect(score.confidence).toBeCloseTo(0.42, 4);
  });

  it("names a pair the model gate never admitted after the gate that did", () => {
    // Both vendors sell one hull but spell the model differently, so the taxonomy holds two
    // rows and the first gate cannot see the pair at all.
    const score = scoreDuplicatePair({
      gates: { modelYear: false, nameBase: true },
      a: side({
        title: "461 Ocean Boulevard Bavaria C46 - 5 cab.",
        modelName: "Bavaria C46 - 5 cab.",
        modelId: "mdl_c46_5cab",
      }),
      b: side({
        title: "461 OCEAN BOULEVARD Bavaria C46",
        modelName: "Bavaria C46",
        modelId: "mdl_c46",
      }),
    });

    expect(score.signals.matchedOn).toBe("name+base");
    expect(score.signals.name).toBe("461oceanboulevard");
    expect(score.signals.differed).toContain("model");
    expect(worthReviewing(score.signals)).toBe(true);
  });

  it("scores a pair both gates propose above one only the name gate does", () => {
    const shared = {
      a: side({ title: "Abba Lagoon 42" }),
      b: side({ title: "Abba Lagoon 42" }),
    };
    const both = scoreDuplicatePair({ gates: BOTH_GATES, ...shared });
    const nameOnly = scoreDuplicatePair({
      gates: { modelYear: false, nameBase: true },
      a: shared.a,
      b: side({ title: "Abba Lagoon 42", modelId: "mdl_other", yearBuilt: 2011 }),
    });

    expect(both.confidence).toBeGreaterThan(nameOnly.confidence);
  });

  it("calls the same boat at the same base a base match when the names disagree", () => {
    const score = scoreDuplicatePair({
      gates: BOTH_GATES,
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
      gates: BOTH_GATES,
      a: side(),
      /* Alimos, ~35 km up the coast from Lavrion. */
      b: side({ homeBaseId: "bse_alimos", lat: 37.9111, lng: 23.7 }),
    });

    expect(score.signals.differed).toContain("base");
    expect(score.signals.agreed).toContain("area");
  });

  it("calls two differently named rows at the same coordinates one berth", () => {
    const score = scoreDuplicatePair({
      gates: BOTH_GATES,
      a: side(),
      b: side({ homeBaseId: "bse_lavrion_olympic", lat: 37.7141, lng: 24.0592 }),
    });

    expect(score.signals.agreed).toContain("base");
    expect(score.signals.differed).not.toContain("area");
    expect(score.confidence).toBe(1);
  });

  it("treats a missing value as neither agreement nor disagreement", () => {
    const score = scoreDuplicatePair({
      gates: BOTH_GATES,
      a: side({ heads: null }),
      b: side(),
    });

    expect(score.signals.agreed).not.toContain("heads");
    expect(score.signals.differed).not.toContain("heads");
    expect(score.confidence).toBeCloseTo(0.96, 4);
  });

  it("allows a few centimetres of drift in the stated length", () => {
    const score = scoreDuplicatePair({
      gates: BOTH_GATES,
      a: side({ lengthM: 13.76 }),
      b: side({ lengthM: 13.7 }),
    });

    expect(score.signals.agreed).toContain("length");
  });
});

describe("worthReviewing", () => {
  const pair = (b: Partial<DuplicateSideFacts>) =>
    scoreDuplicatePair({ gates: BOTH_GATES, a: side(), b: side(b) }).signals;

  it("drops two differently named boats in different marinas", () => {
    const signals = pair({
      title: "Calia Sun Odyssey 449",
      homeBaseId: "bse_blue_lagoon",
      lat: 13.1339,
      lng: -61.2213,
    });

    expect(signals.matchedOn).toBe("model+year");
    expect(worthReviewing(signals)).toBe(false);
  });

  it("keeps a name match however thin the rest of the record is", () => {
    const signals = scoreDuplicatePair({
      gates: BOTH_GATES,
      a: side({ lengthM: null, cabins: null, berths: null, heads: null, builderId: null }),
      b: side({
        lengthM: null,
        cabins: null,
        berths: null,
        heads: null,
        builderId: null,
        homeBaseId: "bse_blue_lagoon",
        lat: 13.1339,
        lng: -61.2213,
        operatorName: "Horizon Yacht Charters",
      }),
    }).signals;

    expect(signals.matchedOn).toBe("name+model+year");
    expect(signals.score).toBeLessThan(0.7);
    expect(worthReviewing(signals)).toBe(true);
  });

  it("keeps two differently named boats at the same berth", () => {
    const signals = pair({ title: "Poseidon Sun Odyssey 449" });

    expect(signals.matchedOn).toBe("base+model+year");
    expect(worthReviewing(signals)).toBe(true);
  });

  it("keeps a pair whose titles carry no name to compare", () => {
    const signals = scoreDuplicatePair({
      gates: BOTH_GATES,
      a: side({ title: "Sun Odyssey 449" }),
      b: side({ title: "Sun Odyssey 449", homeBaseId: "bse_alimos", lat: 37.9111, lng: 23.7 }),
    }).signals;

    expect(signals.matchedOn).toBe("model+year");
    expect(signals.differed).not.toContain("name");
    expect(worthReviewing(signals)).toBe(true);
  });
});
