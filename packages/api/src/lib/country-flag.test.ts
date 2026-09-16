import { describe, expect, it } from "vitest";

import { countryFlag } from "./country-flag";

describe("countryFlag", () => {
  it("builds the flags the planner used to hardcode", () => {
    expect(countryFlag("HR")).toBe("🇭🇷");
    expect(countryFlag("GR")).toBe("🇬🇷");
    expect(countryFlag("IT")).toBe("🇮🇹");
    expect(countryFlag("ES")).toBe("🇪🇸");
  });

  it("accepts lower case and surrounding space", () => {
    expect(countryFlag(" gr ")).toBe("🇬🇷");
  });

  it("returns nothing for a value that is not a two-letter code", () => {
    expect(countryFlag("")).toBe("");
    expect(countryFlag("GRC")).toBe("");
    expect(countryFlag("G1")).toBe("");
  });
});
