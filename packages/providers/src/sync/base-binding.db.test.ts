import { base, baseSource, location, region } from "@yacht-charter/db/schema/geography";
import { listing } from "@yacht-charter/db/schema/listing";
import { operator } from "@yacht-charter/db/schema/operator";
import { provider, providerRecord } from "@yacht-charter/db/schema/provider";
import { suggestedRoute } from "@yacht-charter/db/schema/route";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The writer's media step reads the server env; nothing here syncs media.
vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import type { CanonicalCatalogue } from "../types";
import { writeCanonicalCatalogue } from "./catalogue-writer";

/*
 * Booking Manager base 194, ACI Marina Split, placed first under its own sailing area ("Split")
 * because no other provider sailed from Croatia yet, then under the "Split region" NauSYS brought.
 * A boat and a route stand on its row between the two syncs.
 */

let test: TestDatabase;

const catalogueWith = (
  bases: { externalId: string; regionName: string; name: string; lat?: number }[],
): CanonicalCatalogue => ({
  countries: [{ externalId: "191", code: "HR", name: "Croatia" }],
  regions: bases.map((item) => ({
    externalId: `region:${item.regionName}`,
    externalCountryId: "191",
    name: item.regionName,
  })),
  locations: bases.map((item) => ({
    externalId: `location:${item.regionName}:Split`,
    externalRegionId: `region:${item.regionName}`,
    name: "Split",
    city: "Split",
  })),
  bases: bases.map((item) => ({
    externalId: item.externalId,
    externalLocationId: `location:${item.regionName}:Split`,
    name: item.name,
    lat: item.lat,
  })),
  operators: [],
  builders: [],
  models: [],
  categories: [],
  amenityCategories: [],
  amenities: [],
  listings: [],
});

const sync = (providerId: string, catalogue: CanonicalCatalogue) =>
  writeCanonicalCatalogue({
    db: test.db,
    providerId,
    providerKey: providerId === "prov_bm" ? "booking_manager" : "nausys",
    catalogue,
  });

const boundBase = async (providerId: string, externalId: string) => {
  const [row] = await test.db
    .select({ baseId: baseSource.baseId })
    .from(baseSource)
    .where(and(eq(baseSource.providerId, providerId), eq(baseSource.externalId, externalId)));
  return row?.baseId;
};

const placeOf = async (baseId: string | undefined) => {
  const [row] = await test.db
    .select({ region: region.name, base: base.name, lat: base.lat })
    .from(base)
    .innerJoin(location, eq(location.id, base.locationId))
    .innerJoin(region, eq(region.id, location.regionId))
    .where(eq(base.id, baseId ?? ""));
  return row;
};

beforeAll(async () => {
  test = await createTestDatabase();
  await test.db.insert(provider).values([
    { id: "prov_bm", code: "booking_manager", name: "Booking Manager" },
    { id: "prov_ns", code: "nausys", name: "NauSYS" },
  ]);
  await test.db.insert(operator).values({ id: "op_t", name: "Test", slug: "test" });
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("a provider base bound to its row", () => {
  it("binds the row the first sync writes", async () => {
    await sync("prov_bm", catalogueWith([{ externalId: "194", regionName: "Split", name: "ACI" }]));

    expect(await placeOf(await boundBase("prov_bm", "194"))).toEqual({
      region: "Split",
      base: "ACI",
      lat: null,
    });
  });

  it("moves the row in place when the placement changes, keeping its boats and routes", async () => {
    const baseId = await boundBase("prov_bm", "194");
    if (baseId === undefined) throw new Error("base 194 was not bound");
    await test.db.insert(listing).values({
      id: "lst_boat",
      slug: "boat",
      title: "Boat",
      operatorId: "op_t",
      homeBaseId: baseId,
      status: "published",
    });
    await test.db.insert(suggestedRoute).values({
      id: "srt_split",
      slug: "split-loop",
      baseId,
      title: "Split loop",
      kind: "seven_days",
      nights: 7,
    });

    const summary = await sync(
      "prov_bm",
      catalogueWith([
        { externalId: "194", regionName: "Split region", name: "ACI Marina Split", lat: 43.5 },
      ]),
    );

    expect(await boundBase("prov_bm", "194")).toBe(baseId);
    expect(await placeOf(baseId)).toEqual({
      region: "Split region",
      base: "ACI Marina Split",
      lat: 43.5,
    });
    const [route] = await test.db
      .select({ baseId: suggestedRoute.baseId })
      .from(suggestedRoute)
      .where(eq(suggestedRoute.id, "srt_split"));
    expect(route?.baseId).toBe(baseId);
    expect(summary.rebuildListingIds).toContain("lst_boat");
    // The sailing-area region it left holds nothing any more.
    expect(await test.db.select().from(region).where(eq(region.name, "Split"))).toEqual([]);
  });

  it("adopts the one unbound row of its name in the country, rather than writing another", async () => {
    const [country] = await test.db.select().from(region).limit(1);
    if (country === undefined) throw new Error("no region to hang the old row off");
    await test.db
      .insert(region)
      .values({ id: "rgn_old", countryId: country.countryId, name: "European Inland" });
    await test.db.insert(location).values({ id: "loc_old", regionId: "rgn_old", name: "Kastela" });
    await test.db
      .insert(base)
      .values({ id: "base_old", locationId: "loc_old", name: "Kastela / Marina Kastela" });

    await sync(
      "prov_bm",
      catalogueWith([
        { externalId: "194", regionName: "Split region", name: "ACI Marina Split" },
        { externalId: "25", regionName: "Split region", name: "Kastela / Marina Kastela" },
      ]),
    );

    expect(await boundBase("prov_bm", "25")).toBe("base_old");
    expect(await placeOf("base_old")).toMatchObject({ region: "Split region" });
    expect(await test.db.select().from(region).where(eq(region.id, "rgn_old"))).toEqual([]);
  });

  it("never moves a row another provider stands on, and binds a row of its own instead", async () => {
    const shared = await boundBase("prov_bm", "194");
    await sync(
      "prov_ns",
      catalogueWith([{ externalId: "ns-7", regionName: "Split region", name: "ACI Marina Split" }]),
    );
    expect(await boundBase("prov_ns", "ns-7")).toBe(shared);

    await sync(
      "prov_bm",
      catalogueWith([{ externalId: "194", regionName: "Dalmatia", name: "ACI Marina Split" }]),
    );

    expect(await placeOf(shared)).toMatchObject({ region: "Split region" });
    const own = await boundBase("prov_bm", "194");
    expect(own).not.toBe(shared);
    expect(await placeOf(own)).toMatchObject({ region: "Dalmatia" });
  });
});

/*
 * Booking Manager base 301 leaves "Zadar area" for "Zadar region"; its neighbour 302 stays behind
 * and gets its first boat in the same run, and a NauSYS base with no boat stands there too.
 */
describe("a location a base left", () => {
  const zadar = (
    bases: { externalId: string; regionName: string; name: string }[],
    listings: CanonicalCatalogue["listings"] = [],
  ): CanonicalCatalogue => ({
    countries: [{ externalId: "191", code: "HR", name: "Croatia" }],
    regions: [...new Set(bases.map((item) => item.regionName))].map((name) => ({
      externalId: `region:${name}`,
      externalCountryId: "191",
      name,
    })),
    locations: [...new Set(bases.map((item) => item.regionName))].map((name) => ({
      externalId: `location:${name}`,
      externalRegionId: `region:${name}`,
      name: "Zadar",
      city: "Zadar",
    })),
    bases: bases.map((item) => ({
      externalId: item.externalId,
      externalLocationId: `location:${item.regionName}`,
      name: item.name,
    })),
    operators: [{ externalId: "225", name: "Zadar Charter", slug: "zadar-charter" }],
    builders: [],
    models: [],
    categories: [],
    amenityCategories: [],
    amenities: [],
    listings,
  });
  const boat: CanonicalCatalogue["listings"][number] = {
    externalId: "y-302",
    externalCompanyId: "225",
    externalBaseId: "302",
    title: "Bavaria 46 Nova",
    slug: "bavaria-46-nova",
    spec: { lengthM: 14, cabins: 4, berths: 8, heads: 2, yearBuilt: 2019 },
    media: [],
    amenities: [],
    extras: [],
    texts: [],
    checkinRules: [],
    oneWayRules: [],
    defaultCurrency: "EUR",
  };

  it("keeps the bases still stated there, and puts the new boat on its own", async () => {
    await sync(
      "prov_bm",
      zadar([
        { externalId: "301", regionName: "Zadar area", name: "Marina Borik" },
        { externalId: "302", regionName: "Zadar area", name: "Marina Zadar" },
      ]),
    );
    await sync(
      "prov_ns",
      zadar([{ externalId: "ns-9", regionName: "Zadar area", name: "Marina Tankerkomerc" }]),
    );
    const borik = await boundBase("prov_bm", "301");
    const marinaZadar = await boundBase("prov_bm", "302");
    const tankerkomerc = await boundBase("prov_ns", "ns-9");
    await test.db
      .insert(providerRecord)
      .values({ providerId: "prov_bm", resourceType: "yacht", externalId: "y-302" });

    const summary = await sync(
      "prov_bm",
      zadar(
        [
          { externalId: "301", regionName: "Zadar region", name: "Marina Borik" },
          { externalId: "302", regionName: "Zadar area", name: "Marina Zadar" },
        ],
        [boat],
      ),
    );

    expect(summary.listingsFailed).toBe(0);
    expect(await placeOf(borik)).toMatchObject({ region: "Zadar region" });
    expect(await boundBase("prov_bm", "302")).toBe(marinaZadar);
    expect(await boundBase("prov_ns", "ns-9")).toBe(tankerkomerc);
    expect(await placeOf(tankerkomerc)).toMatchObject({ region: "Zadar area" });
    const [written] = await test.db
      .select({ homeBaseId: listing.homeBaseId })
      .from(listing)
      .where(eq(listing.slug, "bavaria-46-nova"));
    expect(written?.homeBaseId).toBe(marinaZadar);
  });
});
