import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listPopularRoutes } from "../routes/popular-routes";
import {
  base,
  country,
  listing,
  listingSearchDoc,
  location,
  operator,
  region,
  suggestedRoute,
} from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import { listCatalogueCountries } from "./catalogue-countries";

/*
 * Two countries with boats, Croatia ahead of Greece by count, and Italy synced with none. Routes:
 * one from a Croatian base, one drawn over a Greek region, one over the Italian one.
 */
describe("listCatalogueCountries and the popular routes filter", () => {
  let test: TestDatabase;

  beforeAll(async () => {
    test = await createTestDatabase();
    const { db } = test;
    await db.insert(country).values([
      { id: "cty_hr", code: "HR", name: "Croatia" },
      { id: "cty_gr", code: "GR", name: "Greece" },
      { id: "cty_it", code: "IT", name: "Italy" },
    ]);
    await db.insert(region).values([
      { id: "rgn_dal", countryId: "cty_hr", name: "Dalmatia" },
      { id: "rgn_ion", countryId: "cty_gr", name: "Ionian Islands" },
      { id: "rgn_sar", countryId: "cty_it", name: "Sardinia" },
    ]);
    await db.insert(location).values([
      { id: "loc_split", regionId: "rgn_dal", name: "Split" },
      { id: "loc_lefkada", regionId: "rgn_ion", name: "Lefkada" },
    ]);
    await db.insert(base).values([
      { id: "base_split", locationId: "loc_split", name: "ACI Marina Split" },
      { id: "base_lefkada", locationId: "loc_lefkada", name: "Lefkas Marina" },
    ]);
    await db.insert(operator).values({ id: "op_c", name: "Countries", slug: "countries" });

    const boats = [
      { slug: "hr-1", baseId: "base_split", country: "Croatia", region: "Dalmatia" },
      { slug: "hr-2", baseId: "base_split", country: "Croatia", region: "Dalmatia" },
      { slug: "gr-1", baseId: "base_lefkada", country: "Greece", region: "Ionian Islands" },
    ];
    for (const boat of boats) {
      await db.insert(listing).values({
        id: `lst_${boat.slug}`,
        slug: boat.slug,
        title: boat.slug,
        operatorId: "op_c",
        homeBaseId: boat.baseId,
        status: "published",
      });
      await db.insert(listingSearchDoc).values({
        listingId: `lst_${boat.slug}`,
        slug: boat.slug,
        title: boat.slug,
        operator: "Countries",
        baseId: boat.baseId,
        baseName: boat.baseId,
        location: boat.region,
        region: boat.region,
        country: boat.country,
        rating: "0",
        searchableText: boat.slug,
      });
    }

    await db.insert(suggestedRoute).values([
      {
        id: "srt_split",
        slug: "srt-split",
        baseId: "base_split",
        title: "Split loop",
        kind: "seven_days",
        nights: 7,
        featuredRank: 1,
      },
      {
        id: "srt_ionian",
        slug: "srt-ionian",
        regionId: "rgn_ion",
        title: "Ionian week",
        kind: "seven_days",
        nights: 7,
        featuredRank: 2,
      },
      {
        id: "srt_sardinia",
        slug: "srt-sardinia",
        regionId: "rgn_sar",
        title: "Sardinia",
        kind: "seven_days",
        nights: 7,
        featuredRank: 3,
      },
    ]);
  });

  afterAll(async () => {
    await test.drop();
  });

  it("counts boats per country, most first, keeping synced countries with none", async () => {
    expect(await listCatalogueCountries(test.db)).toEqual([
      { name: "Croatia", code: "HR", listingCount: 2 },
      { name: "Greece", code: "GR", listingCount: 1 },
      { name: "Italy", code: "IT", listingCount: 0 },
    ]);
  });

  it("drops empty countries when asked to", async () => {
    const listed = await listCatalogueCountries(test.db, { onlyListed: true });
    expect(listed.map((row) => row.code)).toEqual(["HR", "GR"]);
  });

  it("narrows to one country by its folded name", async () => {
    expect(await listCatalogueCountries(test.db, { name: "greece" })).toEqual([
      { name: "Greece", code: "GR", listingCount: 1 },
    ]);
    expect(await listCatalogueCountries(test.db, { name: "atlantis" })).toEqual([]);
  });

  it("returns every featured route when no filter is given", async () => {
    const routes = await listPopularRoutes(test.db);
    expect(routes.map((route) => route.id)).toEqual(["srt_split", "srt_ionian", "srt_sardinia"]);
  });

  it("links a route by filter values, not by the catalogue's names", async () => {
    const [split, ionian] = await listPopularRoutes(test.db);
    expect(split).toMatchObject({
      countryValue: "croatia",
      marinaValue: "aci-marina-split",
      sailingAreaValue: null,
    });
    expect(ionian).toMatchObject({ countryValue: "greece", sailingAreaValue: "ionian-islands" });
  });

  it("filters routes by country, reaching it through a base or a region", async () => {
    const croatia = await listPopularRoutes(test.db, { country: "croatia" });
    expect(croatia.map((route) => route.id)).toEqual(["srt_split"]);
    const greece = await listPopularRoutes(test.db, { country: "Greece" });
    expect(greece.map((route) => route.id)).toEqual(["srt_ionian"]);
  });

  it("filters routes by region, including a base's own region", async () => {
    const dalmatia = await listPopularRoutes(test.db, { region: "Dalmatia" });
    expect(dalmatia.map((route) => route.id)).toEqual(["srt_split"]);
    const ionian = await listPopularRoutes(test.db, { region: "ionian-islands" });
    expect(ionian.map((route) => route.id)).toEqual(["srt_ionian"]);
  });
});
