import { readFile } from "node:fs/promises";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { base, country, location, region, suggestedRoute } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";

const MIGRATION = new URL("../migrations/0128_bm_regions_from_sailing_areas.sql", import.meta.url);

/*
 * The migration already ran on the empty database `createTestDatabase` built, so the suite writes
 * the geography Booking Manager's old projection produced and runs the same SQL again over it.
 */
describe("0128 moves Booking Manager locations out of world regions", () => {
  let test: TestDatabase;

  const regionOf = async (locationId: string) => {
    const [row] = await test.db
      .select({ id: region.id, name: region.name, countryId: region.countryId })
      .from(location)
      .innerJoin(region, eq(region.id, location.regionId))
      .where(eq(location.id, locationId));
    return row;
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    const { db } = test;
    await db.insert(country).values([
      { id: "cty_hr", code: "HR", name: "Croatia" },
      { id: "cty_gr", code: "GR", name: "Greece" },
      { id: "cty_pf", code: "PF", name: "French Polynesia" },
    ]);
    await db.insert(region).values([
      { id: "rgn_se_hr", countryId: "cty_hr", name: "Southern Europe" },
      { id: "rgn_se_gr", countryId: "cty_gr", name: "Southern Europe" },
      { id: "rgn_poly", countryId: "cty_pf", name: "Polynesia" },
      { id: "rgn_cyclades", countryId: "cty_gr", name: "Cyclades" },
      { id: "rgn_split_nausys", countryId: "cty_hr", name: "Split region" },
    ]);
    await db.insert(location).values([
      { id: "loc_split", regionId: "rgn_se_hr", name: "Split" },
      { id: "loc_kornati", regionId: "rgn_se_hr", name: "Kornati" },
      { id: "loc_hr", regionId: "rgn_se_hr", name: "Croatia" },
      { id: "loc_cyclades", regionId: "rgn_se_gr", name: "Cyclades" },
      { id: "loc_poly", regionId: "rgn_poly", name: "Polynesia" },
      { id: "loc_nausys", regionId: "rgn_split_nausys", name: "ACI Marina Split" },
    ]);
    await db.insert(base).values([
      { id: "base_bm_split", locationId: "loc_split", name: "ACI Marina Split" },
      { id: "base_nausys_split", locationId: "loc_nausys", name: "ACI Marina Split" },
    ]);
    await db.insert(suggestedRoute).values({
      id: "srt_split",
      baseId: "base_bm_split",
      title: "Split loop",
      kind: "seven_days",
      nights: 7,
    });

    await db.execute(sql.raw(await readFile(MIGRATION, "utf8")));
  });

  afterAll(async () => {
    await test?.drop();
  });

  it("gives each sailing area a region of its own name in the same country", async () => {
    expect(await regionOf("loc_split")).toMatchObject({ name: "Split", countryId: "cty_hr" });
    expect(await regionOf("loc_kornati")).toMatchObject({ name: "Kornati", countryId: "cty_hr" });
    expect(await regionOf("loc_hr")).toMatchObject({ name: "Croatia", countryId: "cty_hr" });
  });

  it("files a location under the region another vendor already created for that area", async () => {
    expect(await regionOf("loc_cyclades")).toMatchObject({ id: "rgn_cyclades" });
  });

  it("leaves a location that is its world region's namesake and every other vendor's row alone", async () => {
    expect(await regionOf("loc_poly")).toMatchObject({ id: "rgn_poly" });
    expect(await regionOf("loc_nausys")).toMatchObject({ id: "rgn_split_nausys" });
  });

  it("keeps the base, and so the route attached to it", async () => {
    const [route] = await test.db
      .select({ baseId: suggestedRoute.baseId })
      .from(suggestedRoute)
      .where(eq(suggestedRoute.id, "srt_split"));
    const [moved] = await test.db
      .select({ locationId: base.locationId })
      .from(base)
      .where(eq(base.id, "base_bm_split"));

    expect(route?.baseId).toBe("base_bm_split");
    expect(moved?.locationId).toBe("loc_split");
  });

  it("is a no-op the second time", async () => {
    const before = await test.db.select().from(region);
    await test.db.execute(sql.raw(await readFile(MIGRATION, "utf8")));
    const after = await test.db.select().from(region);

    expect(after).toHaveLength(before.length);
    expect(await regionOf("loc_split")).toMatchObject({ name: "Split" });
  });
});
