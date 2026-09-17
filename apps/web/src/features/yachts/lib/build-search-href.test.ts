import { describe, expect, it } from "vitest";

import { buildSearchHref } from "./build-search-href";

describe("buildSearchHref", () => {
  it("names the figure a price bound caps", () => {
    const href = buildSearchHref({ country: ["greece"], price: [0, 2400], pricing: "charter" });
    const params = new URLSearchParams(href.split("?")[1]);

    expect(params.get("pricing")).toBe("charter");
    expect(params.get("country")).toBe("greece");
    expect(params.get("price")).toBe("0,2400");
  });

  it("leaves the default basis out of the link", () => {
    expect(buildSearchHref({ country: ["greece"] })).not.toContain("pricing");
  });
});
