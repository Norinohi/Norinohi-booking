import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { base, country, listing, listingSearchDoc, location, operator, region } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import { listCatalogPages } from "./catalog-pages";

/*
 * Croatia with a real sailing region and the world region Booking Manager files it under, Greece
 * under the same world region, the Ionian as a sailing area in both Greece and Italy, and a
 * shipyard NauSYS names "Unknown". Two boats per combination
 * against a threshold of two, so every page exists on count alone.
 */
describe("listCatalogPages withholds pages that name no place or no shipyard", () => {
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
      { id: "rgn_split", countryId: "cty_hr", name: "Split region" },
      { id: "rgn_se_hr", countryId: "cty_hr", name: "Southern Europe" },
      { id: "rgn_se_gr", countryId: "cty_gr", name: "Southern Europe" },
      { id: "rgn_ion_gr", countryId: "cty_gr", name: "Ionian" },
      { id: "rgn_ion_it", countryId: "cty_it", name: "Ionian" },
    ]);
    await db.insert(location).values([
      { id: "loc_split", regionId: "rgn_split", name: "Split" },
      { id: "loc_se_hr", regionId: "rgn_se_hr", name: "Adriatic" },
      { id: "loc_se_gr", regionId: "rgn_se_gr", name: "Aegean" },
      { id: "loc_ion_gr", regionId: "rgn_ion_gr", name: "Lefkada" },
      { id: "loc_ion_it", regionId: "rgn_ion_it", name: "Crotone" },
    ]);
    await db.insert(base).values([
      { id: "base_split", locationId: "loc_split", name: "ACI Marina Split" },
      { id: "base_se_hr", locationId: "loc_se_hr", name: "Marina Kastela" },
      { id: "base_se_gr", locationId: "loc_se_gr", name: "Alimos Marina" },
      { id: "base_ion_gr", locationId: "loc_ion_gr", name: "D-Marin Lefkas" },
      { id: "base_ion_it", locationId: "loc_ion_it", name: "Marina di Crotone" },
    ]);
    await db.insert(operator).values({ id: "op_p", name: "Pages", slug: "pages" });

    const boats = [
      { slug: "split", baseId: "base_split", country: "Croatia", region: "Split region" },
      { slug: "se-hr", baseId: "base_se_hr", country: "Croatia", region: "Southern Europe" },
      { slug: "se-gr", baseId: "base_se_gr", country: "Greece", region: "Southern Europe" },
      { slug: "ion-gr", baseId: "base_ion_gr", country: "Greece", region: "Ionian" },
      { slug: "ion-it", baseId: "base_ion_it", country: "Italy", region: "Ionian" },
    ];
    for (const boat of boats) {
      for (const [index, builder] of ["Unknown", "Bavaria"].entries()) {
        const slug = `${boat.slug}-${index}`;
        await db.insert(listing).values({
          id: `lst_${slug}`,
          slug,
          title: slug,
          operatorId: "op_p",
          homeBaseId: boat.baseId,
          status: "published",
        });
        await db.insert(listingSearchDoc).values({
          listingId: `lst_${slug}`,
          slug,
          title: slug,
          operator: "Pages",
          baseId: boat.baseId,
          baseName: boat.baseId,
          location: boat.region,
          region: boat.region,
          country: boat.country,
          category: "Sailing yacht",
          builder,
          rating: "0",
          searchableText: slug,
        });
      }
    }
  });

  afterAll(async () => {
    await test?.drop();
  });

  it("keeps sailing regions, even one that crosses a border, and drops world regions", async () => {
    const paths = (await listCatalogPages(test.db, { threshold: 2 })).map(
      (page) => `${page.root}/${page.segments.join("/")}`,
    );

    expect(paths).toContain("yacht-charter/croatia/split-region");
    expect(paths).toContain("yacht-charter/sailing-yacht/croatia/split-region");
    expect(paths).toContain("yacht-charter/croatia");
    expect(paths).toContain("yacht-charter/greece/ionian");
    expect(paths).toContain("yacht-charter/italy/ionian");
    expect(paths.filter((path) => path.includes("southern-europe"))).toEqual([]);
  });

  it("drops the placeholder shipyard and keeps a real one", async () => {
    const shipyards = (await listCatalogPages(test.db, { threshold: 2 }))
      .filter((page) => page.root === "shipyard" && page.kind === "builder")
      .map((page) => page.segments.join("/"));

    expect(shipyards).toEqual(["bavaria"]);
  });
});
