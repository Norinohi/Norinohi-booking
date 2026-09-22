import { describe, expect, it } from "vitest";

import { placeLabel } from "./popular-routes";

describe("placeLabel", () => {
  it("names a region-drawn route's region once", () => {
    expect(placeLabel([null, "Split region", "Croatia"])).toBe("Split region · Croatia");
  });

  it("collapses a territory that is its own region and country", () => {
    expect(placeLabel([null, "British Virgin Islands", "British Virgin Islands"])).toBe(
      "British Virgin Islands",
    );
  });

  it("keeps base, region and country when they differ", () => {
    expect(placeLabel(["ACI Marina Split", "Dalmatia", "Croatia"])).toBe(
      "ACI Marina Split · Dalmatia · Croatia",
    );
  });

  it("treats spellings that fold alike as one place", () => {
    expect(placeLabel(["Šibenik", "Sibenik", "Croatia"])).toBe("Šibenik · Croatia");
  });
});
