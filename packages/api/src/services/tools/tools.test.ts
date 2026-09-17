import * as schema from "@yacht-charter/db/schema/index";
import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";

import { BadRequestError } from "../../errors";
import type { ToolContext } from "./index";

/*
 * The catalogue contract reaches the provider registry, which validates the server env when it is
 * loaded. Nothing here reads that env, so validation is skipped and the registry imported after.
 */
process.env.SKIP_ENV_VALIDATION ??= "1";
const { invokeTool, toolManifest, tools } = await import("./index");

/*
 * A pool that never connects: node-postgres opens a connection on the first query, and every
 * case below is refused before `run` could issue one. A query reaching it fails loudly.
 */
const ctx: ToolContext = {
  db: drizzle({ connection: "postgresql://nobody@127.0.0.1:1/none", schema }),
};

function accepts<TName extends keyof typeof tools>(
  name: TName,
  input: Parameters<(typeof tools)[TName]["input"]["safeParse"]>[0],
) {
  return tools[name].input.safeParse(input).success;
}

describe("tool registry", () => {
  it("keys every tool by its own name", () => {
    for (const [key, tool] of Object.entries(tools)) expect(tool.name).toBe(key);
  });

  it("describes every input as JSON Schema", () => {
    const manifest = toolManifest();
    expect(manifest.map((entry) => entry.name)).toEqual(Object.keys(tools));
    for (const entry of manifest) {
      expect(entry.description.length).toBeGreaterThan(40);
      expect(entry.inputSchema).toMatchObject({ type: "object" });
    }
  });

  it("refuses invalid input with a domain error before running", async () => {
    await expect(invokeTool(tools.nearestMarinas, ctx, { lat: 91, lng: 0 })).rejects.toBeInstanceOf(
      BadRequestError,
    );
    await expect(
      invokeTool(tools.quotePreview, ctx, {
        listingId: "ylst_x",
        checkIn: "2026-07-11",
        checkOut: "2026-07-04",
      }),
    ).rejects.toMatchObject({ kind: "BAD_REQUEST", data: { code: "TOOL_INPUT_INVALID" } });
  });
});

describe("searchYachts input", () => {
  it("accepts an empty search and a dated one", () => {
    expect(accepts("searchYachts", {})).toBe(true);
    expect(
      accepts("searchYachts", {
        country: ["Croatia"],
        checkIn: "2026-07-04",
        checkOut: "2026-07-11",
      }),
    ).toBe(true);
  });

  it("refuses a check-out before check-in, a bad date and an oversized page", () => {
    expect(accepts("searchYachts", { checkIn: "2026-07-11", checkOut: "2026-07-04" })).toBe(false);
    expect(accepts("searchYachts", { checkIn: "2026-13-40" })).toBe(false);
    expect(accepts("searchYachts", { pageSize: 51 })).toBe(false);
  });
});

describe("yachtAvailability input", () => {
  const listingId = "ylst_x";

  it("accepts a season-long window", () => {
    expect(accepts("yachtAvailability", { listingId, from: "2026-05-01", to: "2026-10-31" })).toBe(
      true,
    );
  });

  it("refuses an inverted or empty window", () => {
    expect(accepts("yachtAvailability", { listingId, from: "2026-07-01", to: "2026-07-01" })).toBe(
      false,
    );
    expect(accepts("yachtAvailability", { listingId, from: "2026-07-02", to: "2026-07-01" })).toBe(
      false,
    );
  });

  it("refuses a window longer than the limit", () => {
    expect(accepts("yachtAvailability", { listingId, from: "2026-01-01", to: "2027-12-31" })).toBe(
      false,
    );
  });
});

describe("quotePreview input", () => {
  it("accepts a week", () => {
    expect(
      accepts("quotePreview", {
        listingId: "ylst_x",
        checkIn: "2026-07-04",
        checkOut: "2026-07-11",
      }),
    ).toBe(true);
  });

  it("refuses a missing listing, a zero-night charter and one over a year", () => {
    expect(
      accepts("quotePreview", { listingId: "", checkIn: "2026-07-04", checkOut: "2026-07-11" }),
    ).toBe(false);
    expect(
      accepts("quotePreview", {
        listingId: "ylst_x",
        checkIn: "2026-07-04",
        checkOut: "2026-07-04",
      }),
    ).toBe(false);
    expect(
      accepts("quotePreview", {
        listingId: "ylst_x",
        checkIn: "2026-07-04",
        checkOut: "2027-07-05",
      }),
    ).toBe(false);
  });
});

describe("suggestRoutes input", () => {
  it("accepts no filter, a country, a region and a base", () => {
    expect(accepts("suggestRoutes", {})).toBe(true);
    expect(accepts("suggestRoutes", { country: "Croatia", region: "Dalmatia", limit: 6 })).toBe(
      true,
    );
    expect(accepts("suggestRoutes", { baseId: "base_split", locale: "de" })).toBe(true);
  });

  it("refuses a blank place, an empty base id and a limit past the slider", () => {
    expect(accepts("suggestRoutes", { country: "  " })).toBe(false);
    expect(accepts("suggestRoutes", { baseId: "" })).toBe(false);
    expect(accepts("suggestRoutes", { limit: 25 })).toBe(false);
  });
});

describe("nearestMarinas input", () => {
  const split = { lat: 43.5, lng: 16.44 };

  it("fills the defaults", () => {
    expect(tools.nearestMarinas.input.parse(split)).toEqual({
      ...split,
      limit: 10,
      maxKm: 100,
      onlyWithListings: true,
    });
  });

  it("accepts the edges of the globe and of each limit", () => {
    expect(accepts("nearestMarinas", { lat: -90, lng: 180, limit: 50, maxKm: 500 })).toBe(true);
    expect(accepts("nearestMarinas", { lat: 90, lng: -180, limit: 1, maxKm: 0.5 })).toBe(true);
  });

  it.each([
    ["latitude above 90", { lat: 90.1, lng: 0 }],
    ["latitude below -90", { lat: -90.1, lng: 0 }],
    ["longitude above 180", { lat: 0, lng: 180.1 }],
    ["longitude below -180", { lat: 0, lng: -180.1 }],
    ["zero limit", { ...split, limit: 0 }],
    ["fractional limit", { ...split, limit: 2.5 }],
    ["limit above 50", { ...split, limit: 51 }],
    ["zero radius", { ...split, maxKm: 0 }],
    ["radius above 500", { ...split, maxKm: 501 }],
  ])("refuses a %s", (_label, input) => {
    expect(accepts("nearestMarinas", input)).toBe(false);
  });
});
