import { describe, expect, it } from "vitest";

import { savedCardInput } from "./saved-card-input";

describe("savedCardInput", () => {
  it("prices the cards for the period last searched", () => {
    expect(savedCardInput("uk", null, { checkIn: "2026-11-07", checkOut: "2026-11-14" })).toEqual({
      locale: "uk",
      startDate: "2026-11-07",
      duration: 7,
    });
    expect(
      savedCardInput("en", "all_in", { checkIn: "2026-10-31", checkOut: "2026-11-03" }),
    ).toEqual({ locale: "en", priceBasis: "all_in", startDate: "2026-10-31", duration: 3 });
  });

  it("leaves the period out when none was searched, so the nearest charter is priced", () => {
    expect(savedCardInput("uk", null, null)).toEqual({ locale: "uk" });
    expect(savedCardInput("de", "base", null)).toEqual({ locale: "de", priceBasis: "base" });
  });
});
