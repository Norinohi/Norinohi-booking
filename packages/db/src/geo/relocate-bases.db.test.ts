import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  base,
  country,
  listing,
  listingOffer,
  listingSource,
  location,
  operator,
  provider,
  providerRecord,
  region,
  suggestedRoute,
} from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import { listReferenceRegions } from "./reference-regions";
import { pruneEmptyGeography, relocateBases } from "./relocate-bases";

/*
 * Croatia as the old Booking Manager projection left it: a "Southern Europe" region holding a
 * "Split" sailing area with two moored bases, one of them with a route, plus a stale base nothing
 * uses. Beside it NauSYS's "Split region" with its own marina, which one Booking Manager base
 * names the same way.
 */
describe("relocating Booking Manager bases into the regions NauSYS uses", () => {
  let test: TestDatabase;

  const placeOf = async (baseId: string) => {
    const [row] = await test.db
      .select({ region: region.name, location: location.name, city: location.city })
      .from(base)
      .innerJoin(location, eq(location.id, base.locationId))
      .innerJoin(region, eq(region.id, location.regionId))
      .where(eq(base.id, baseId));
    return row;
  };

  const moor = async (slug: string, providerId: string, baseId: string) => {
    await test.db.insert(listing).values({
      id: `lst_${slug}`,
      slug,
      title: slug,
      operatorId: "op_t",
      homeBaseId: baseId,
      status: "published",
    });
    await test.db.insert(providerRecord).values({
      id: `prec_${slug}`,
      providerId,
      resourceType: "yacht",
      externalId: slug,
    });
    await test.db.insert(listingSource).values({
      id: `lsrc_${slug}`,
      listingId: `lst_${slug}`,
      providerRecordId: `prec_${slug}`,
      externalYachtId: slug,
    });
    await test.db.insert(listingOffer).values({
      id: `off_${slug}`,
      listingId: `lst_${slug}`,
      listingSourceId: `lsrc_${slug}`,
      providerId,
      operatorId: "op_t",
      homeBaseId: baseId,
    });
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    const { db } = test;
    await db.insert(provider).values([
      { id: "prov_ns", code: "nausys", name: "NauSYS" },
      { id: "prov_bm", code: "booking_manager", name: "Booking Manager" },
    ]);
    await db.insert(operator).values({ id: "op_t", name: "Test", slug: "test" });
    await db.insert(country).values({ id: "cty_hr", code: "HR", name: "Croatia" });
    await db.insert(region).values([
      { id: "rgn_se", countryId: "cty_hr", name: "Southern Europe" },
      { id: "rgn_split", countryId: "cty_hr", name: "Split region" },
    ]);
    await db.insert(location).values([
      { id: "loc_bm_split", regionId: "rgn_se", name: "Split" },
      { id: "loc_ns_trogir", regionId: "rgn_split", name: "Trogir", city: "Trogir" },
    ]);
    await db.insert(base).values([
      { id: "base_bm_aci", locationId: "loc_bm_split", name: "ACI Marina Split" },
      { id: "base_bm_trogir", locationId: "loc_bm_split", name: "Trogir" },
      { id: "base_bm_stale", locationId: "loc_bm_split", name: "Old name of a marina" },
      { id: "base_ns_trogir", locationId: "loc_ns_trogir", name: "Trogir", lat: 43.52, lng: 16.25 },
    ]);
    await moor("ns-boat", "prov_ns", "base_ns_trogir");
    await moor("bm-aci", "prov_bm", "base_bm_aci");
    await moor("bm-trogir", "prov_bm", "base_bm_trogir");
    await db.insert(suggestedRoute).values([
      {
        id: "srt_aci",
        slug: "split-loop",
        baseId: "base_bm_aci",
        title: "Split loop",
        kind: "seven_days",
        nights: 7,
      },
      {
        id: "srt_se",
        slug: "adriatic",
        regionId: "rgn_se",
        title: "Adriatic",
        kind: "seven_days",
        nights: 7,
      },
    ]);
  });

  afterAll(async () => {
    await test?.drop();
  });

  it("reads only the regions another provider's boats sail from", async () => {
    expect(await listReferenceRegions(test.db, "prov_bm")).toEqual([
      { countryCode: "HR", name: "Split region", points: [{ lat: 43.52, lng: 16.25 }] },
    ]);
  });

  it("dry runs inside a rolled back transaction without changing anything", async () => {
    await test.db
      .transaction(async (tx) => {
        await relocateBases(tx, [
          {
            baseId: "base_bm_aci",
            countryCode: "HR",
            regionName: "Split region",
            locationName: "Split",
            city: "Split",
            baseName: "ACI Marina Split",
          },
        ]);
        tx.rollback();
      })
      .catch(() => undefined);

    expect(await placeOf("base_bm_aci")).toMatchObject({ region: "Southern Europe" });
  });

  it("moves a base in place, merges one into the same-named marina, then prunes", async () => {
    const report = await test.db.transaction(async (tx) => {
      const relocation = await relocateBases(tx, [
        {
          baseId: "base_bm_aci",
          countryCode: "HR",
          regionName: "Split region",
          locationName: "Split",
          city: "Split",
          baseName: "ACI Marina Split",
        },
        {
          baseId: "base_bm_trogir",
          countryCode: "HR",
          regionName: "Split region",
          locationName: "Trogir",
          city: "Trogir",
          baseName: "Trogir",
        },
      ]);
      const pruned = await pruneEmptyGeography(tx, {
        regionNames: ["Southern Europe"],
        locationIds: relocation.vacatedLocationIds,
      });
      return { relocation, pruned };
    });

    expect(await placeOf("base_bm_aci")).toEqual({
      region: "Split region",
      location: "Split",
      city: "Split",
    });
    const [route] = await test.db
      .select({ baseId: suggestedRoute.baseId })
      .from(suggestedRoute)
      .where(eq(suggestedRoute.id, "srt_aci"));
    expect(route?.baseId).toBe("base_bm_aci");

    expect(report.relocation.relocations.map((item) => item.mergedInto)).toEqual([
      null,
      "base_ns_trogir",
    ]);
    const [merged] = await test.db
      .select({ listing: listing.homeBaseId, offer: listingOffer.homeBaseId })
      .from(listing)
      .innerJoin(listingOffer, eq(listingOffer.listingId, listing.id))
      .where(eq(listing.id, "lst_bm-trogir"));
    expect(merged).toEqual({ listing: "base_ns_trogir", offer: "base_ns_trogir" });
    expect(await placeOf("base_bm_trogir")).toBeUndefined();

    expect([...report.relocation.affectedListingIds].sort()).toEqual([
      "lst_bm-aci",
      "lst_bm-trogir",
      "lst_ns-boat",
    ]);

    expect(report.pruned).toEqual({ bases: 1, locations: 1, regions: 0 });
    expect(await placeOf("base_bm_stale")).toBeUndefined();
    const [world] = await test.db.select().from(region).where(eq(region.id, "rgn_se"));
    expect(world?.name).toBe("Southern Europe");
  });

  it("is a no-op the second time, filling only an empty city", async () => {
    await test.db.update(location).set({ city: null }).where(eq(location.name, "Split"));
    const relocation = await relocateBases(test.db, [
      {
        baseId: "base_bm_aci",
        countryCode: "HR",
        regionName: "Split region",
        locationName: "Split",
        city: "Split",
        baseName: "ACI Marina Split",
      },
    ]);

    expect(relocation).toMatchObject({ relocations: [], unchanged: 1, citiesFilled: 1 });
    expect(await placeOf("base_bm_aci")).toMatchObject({ city: "Split" });
  });
});
