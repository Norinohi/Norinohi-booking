import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { base, country, listing, listingSearchDoc, location, operator, region } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import { boundingBox, isInBoundingBox } from "./bounds";
import { distanceKm } from "./distance";
import { listBasesNearRoute, listNearestBases } from "./nearest-marinas";

const SPLIT = { lat: 43.5081, lng: 16.4402 };
const CORNER = { lat: 43.7941, lng: 16.8349 };

/*
 * Real marina coordinates around Split, so the distances are ones a reader can sanity-check:
 * roughly 1 km, 15 km, 37 km and 160 km away. The corner point is 45 km north-east, inside the
 * bounding box of a 40 km search but outside its circle, so only the exact distance drops it. The
 * Ancona base sits inside the latitude band of a 200 km box but across the Adriatic, which the
 * longitude half of the prefilter has to reject.
 */
const BASES = [
  { id: "base_dubrovnik", name: "ACI Marina Dubrovnik", lat: 42.6693, lng: 18.1264 },
  { id: "base_hvar", name: "ACI Marina Palmizana", lat: 43.1636, lng: 16.3953 },
  { id: "base_split", name: "ACI Marina Split", lat: 43.5034, lng: 16.4313 },
  { id: "base_trogir", name: "ACI Marina Trogir", lat: 43.5148, lng: 16.2503 },
  { id: "base_corner", name: "Inland Corner", ...CORNER },
  { id: "base_ancona", name: "Marina Dorica", lat: 43.6158, lng: 13.5189 },
  { id: "base_nowhere", name: "Unmapped Base", lat: null, lng: null },
];

/* The geography above, with boats listed at the named bases only. */
async function seed(db: TestDatabase["db"], listed: { baseId: string; slugs: string[] }[]) {
  await db.insert(country).values({ id: "cty_hr", code: "HR", name: "Croatia" });
  await db.insert(region).values({ id: "rgn_dal", countryId: "cty_hr", name: "Dalmatia" });
  await db
    .insert(location)
    .values({ id: "loc_dal", regionId: "rgn_dal", name: "Dalmatia", city: "Split" });
  await db.insert(base).values(BASES.map((row) => ({ ...row, locationId: "loc_dal" })));

  await db.insert(operator).values({ id: "op_geo", name: "Geo Charter", slug: "geo-charter" });
  for (const { baseId, slugs } of listed) {
    const baseName = BASES.find((row) => row.id === baseId)?.name ?? baseId;
    for (const slug of slugs) {
      await db.insert(listing).values({
        id: `lst_${slug}`,
        slug,
        title: slug,
        operatorId: "op_geo",
        homeBaseId: baseId,
        status: "published",
      });
      await db.insert(listingSearchDoc).values({
        listingId: `lst_${slug}`,
        slug,
        title: slug,
        operator: "Geo Charter",
        baseId,
        baseName,
        location: "Dalmatia",
        region: "Dalmatia",
        country: "Croatia",
        rating: "0",
        searchableText: slug,
      });
    }
  }
}

describe("listNearestBases", () => {
  let test: TestDatabase;

  beforeAll(async () => {
    test = await createTestDatabase();
    await seed(test.db, [{ baseId: "base_trogir", slugs: ["trogir-1", "trogir-2"] }]);
  });

  afterAll(async () => {
    await test.drop();
  });

  it("orders bases by distance and agrees with the TypeScript haversine", async () => {
    const rows = await listNearestBases(test.db, { ...SPLIT, limit: 10, maxKm: 500 });

    expect(rows.map((row) => row.id)).toEqual([
      "base_split",
      "base_trogir",
      "base_hvar",
      "base_corner",
      "base_dubrovnik",
      "base_ancona",
    ]);
    for (const row of rows) {
      expect(row.distanceKm).toBeCloseTo(distanceKm(SPLIT, row), 6);
    }
    expect(rows[0]).toMatchObject({
      name: "ACI Marina Split",
      location: "Dalmatia",
      city: "Split",
      region: "Dalmatia",
      country: "Croatia",
      countryCode: "HR",
    });
  });

  it("cuts at maxKm, including the corners the bounding box admits", async () => {
    const rows = await listNearestBases(test.db, { ...SPLIT, limit: 10, maxKm: 40 });
    expect(rows.map((row) => row.id)).toEqual(["base_split", "base_trogir", "base_hvar"]);
    expect(rows.every((row) => row.distanceKm <= 40)).toBe(true);
    expect(isInBoundingBox(CORNER, boundingBox(SPLIT, 40))).toBe(true);
    expect(distanceKm(SPLIT, CORNER)).toBeGreaterThan(40);
  });

  it("drops a base inside the latitude band but outside the radius", async () => {
    const rows = await listNearestBases(test.db, { ...SPLIT, limit: 10, maxKm: 200 });
    expect(rows.map((row) => row.id)).not.toContain("base_ancona");
    expect(rows.map((row) => row.id)).toContain("base_dubrovnik");
  });

  it("applies the limit after ordering", async () => {
    const rows = await listNearestBases(test.db, { ...SPLIT, limit: 2, maxKm: 500 });
    expect(rows.map((row) => row.id)).toEqual(["base_split", "base_trogir"]);
  });

  it("counts listings and can keep only bases that have some", async () => {
    const all = await listNearestBases(test.db, { ...SPLIT, limit: 10, maxKm: 40 });
    expect(Object.fromEntries(all.map((row) => [row.id, row.listingCount]))).toEqual({
      base_split: 0,
      base_trogir: 2,
      base_hvar: 0,
    });

    const listed = await listNearestBases(test.db, {
      ...SPLIT,
      limit: 10,
      maxKm: 40,
      onlyWithListings: true,
    });
    expect(listed.map((row) => row.id)).toEqual(["base_trogir"]);
  });
});

describe("listBasesNearRoute", () => {
  let test: TestDatabase;

  /* Split out to Hvar and on to Dubrovnik: a one-way charter, so both ends have marinas. */
  const ROUTE = [
    { name: "Split", lat: 43.5081, lng: 16.4402 },
    { name: "Hvar", lat: 43.172, lng: 16.44 },
    { name: "Dubrovnik", lat: 42.65, lng: 18.09 },
  ];

  beforeAll(async () => {
    test = await createTestDatabase();
    await seed(test.db, [
      { baseId: "base_split", slugs: ["split-1"] },
      { baseId: "base_trogir", slugs: ["trogir-1", "trogir-2"] },
      { baseId: "base_hvar", slugs: ["hvar-1"] },
      { baseId: "base_dubrovnik", slugs: ["dubrovnik-1"] },
      { baseId: "base_ancona", slugs: ["ancona-1"] },
    ]);
  });

  afterAll(async () => {
    await test.drop();
  });

  it("finds bases near every stop, not only the start, in the order the route reaches them", async () => {
    const rows = await listBasesNearRoute(test.db, { stops: ROUTE, maxKm: 20, limit: 10 });

    expect(rows.map((row) => [row.id, row.nearStop])).toEqual([
      ["base_split", "Split"],
      ["base_trogir", "Split"],
      ["base_hvar", "Hvar"],
      ["base_dubrovnik", "Dubrovnik"],
    ]);
    expect(rows.map((row) => row.nearStopIndex)).toEqual([0, 0, 1, 2]);
  });

  it("measures each base to its nearest stop and keeps the cut", async () => {
    const rows = await listBasesNearRoute(test.db, { stops: ROUTE, maxKm: 20, limit: 10 });
    for (const row of rows) {
      const nearest = Math.min(...ROUTE.map((stop) => distanceKm(stop, row)));
      expect(row.distanceKm).toBeCloseTo(nearest, 6);
      expect(row.distanceKm).toBeLessThanOrEqual(20);
    }
    expect(rows.find((row) => row.id === "base_trogir")?.listingCount).toBe(2);
  });

  it("answers nothing for a route with no stops", async () => {
    expect(await listBasesNearRoute(test.db, { stops: [], maxKm: 20, limit: 10 })).toEqual([]);
  });
});
