import { describe, expect, it } from "vitest";

import { canonicalModelName } from "./model-names";

describe("canonicalModelName", () => {
  it("strips a trailing cabin count", () => {
    expect(canonicalModelName("Bali 4.6 - 5 cab.")).toBe("Bali 4.6");
    expect(canonicalModelName("Bavaria Cruiser 45 - 3 cab.")).toBe("Bavaria Cruiser 45");
    expect(canonicalModelName("Bali 5.4 - 5 + 2 cab")).toBe("Bali 5.4");
    expect(canonicalModelName("Lagoon 52 F - 6 + 2 cab.")).toBe("Lagoon 52 F");
    expect(canonicalModelName("Azimut Grande - 5 + 1 cab.")).toBe("Azimut Grande");
  });

  it("collapses the layouts of one hull onto the same name", () => {
    const layouts = ["Bavaria Cruiser 46 - 3 cab.", "Bavaria Cruiser 46 - 4 cab."];
    expect(new Set(layouts.map(canonicalModelName)).size).toBe(1);
  });

  it("returns null when there is nothing to strip", () => {
    /* Every one of these is a real NauSYS model name; none carries a cabin count. */
    for (const name of [
      "Bavaria 30 Cruiser",
      "Bavaria 40 Vision",
      "Bavaria C46 ELECTRIC",
      "Sun Odyssey 54 DS",
      "Athena 38",
    ]) {
      expect(canonicalModelName(name)).toBeNull();
    }
  });

  it("leaves a name whose only content is the suffix alone", () => {
    expect(canonicalModelName("4 cab.")).toBeNull();
  });
});
