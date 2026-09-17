import { describe, expect, it } from "vitest";

import { periodFromSearchHref } from "./last-search";

const TODAY = "2026-09-17";

describe("periodFromSearchHref", () => {
  it("turns a dated search into the charter it asked for", () => {
    expect(periodFromSearchHref("/yachts?startDate=2026-10-10&duration=7", TODAY)).toEqual({
      checkIn: "2026-10-10",
      checkOut: "2026-10-17",
    });
    expect(
      periodFromSearchHref("/yacht-charter/croatia?duration=14&startDate=2026-10-31", TODAY),
    ).toEqual({ checkIn: "2026-10-31", checkOut: "2026-11-14" });
  });

  it("has no period for a search without a start, a length, or a future start", () => {
    expect(periodFromSearchHref("/yachts", TODAY)).toBeNull();
    expect(periodFromSearchHref("/yachts?duration=7", TODAY)).toBeNull();
    expect(periodFromSearchHref("/yachts?startDate=2026-10-10", TODAY)).toBeNull();
    expect(periodFromSearchHref("/yachts?startDate=2026-10-10&duration=any", TODAY)).toBeNull();
    expect(periodFromSearchHref("/yachts?startDate=2026-09-01&duration=7", TODAY)).toBeNull();
    expect(periodFromSearchHref("/yachts?startDate=soon&duration=7", TODAY)).toBeNull();
  });
});
