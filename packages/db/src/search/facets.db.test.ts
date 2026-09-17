import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { facetMedia, listing, listingSearchDoc } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import { seedSearchWorld } from "../test-support/search-fixture";
import { listSearchFacets } from "./facets";
import type { ListingFacetOption, ListingSearchInput } from "./types";

/*
 * Every facet counts under the search's other filters but not its own, so choosing a country
 * still lists the other countries. The facets share one candidate set, so these pin which filters
 * each list ignores and that a boat failing two facets' filters reaches none of them.
 */

type Doc = {
  slug: string;
  country: string;
  region: string;
  baseName: string;
  operator: string;
  category: string;
  model: string;
  crewType: string;
  amenities: string[];
  yearBuilt: number;
  cabins: number;
};

const DOCS: Doc[] = [
  {
    slug: "split-cat",
    country: "Croatia",
    region: "Split",
    baseName: "Marina Kastela",
    operator: "Alpha Charter",
    category: "Catamaran",
    model: "Lagoon 42",
    crewType: "bareboat",
    amenities: ["Autopilot", "Bimini"],
    yearBuilt: 2018,
    cabins: 4,
  },
  {
    slug: "split-mono",
    country: "Croatia",
    region: "Split",
    baseName: "Marina Kastela",
    operator: "Beta Yachting",
    category: "Sailing yacht",
    model: "Bavaria 46",
    crewType: "crewed",
    amenities: ["Autopilot"],
    yearBuilt: 2010,
    cabins: 3,
  },
  {
    slug: "dubrovnik-cat",
    country: "Croatia",
    region: "Dubrovnik",
    baseName: "ACI Dubrovnik",
    operator: "Alpha Charter",
    category: "Catamaran",
    model: "Bali 4.6",
    crewType: "bareboat",
    amenities: ["Bimini"],
    yearBuilt: 2020,
    cabins: 5,
  },
  {
    slug: "athens-mono",
    country: "Greece",
    region: "Athens",
    baseName: "Alimos Marina",
    operator: "Beta Yachting",
    category: "Sailing yacht",
    model: "Bavaria 46",
    crewType: "bareboat",
    amenities: ["Autopilot", "autopilot"],
    yearBuilt: 2015,
    cabins: 3,
  },
  {
    slug: "athens-cat",
    country: "Greece",
    region: "Athens",
    baseName: "Alimos Marina",
    operator: "Alpha Charter",
    category: "Catamaran",
    model: "Lagoon 42",
    crewType: "bareboat",
    amenities: [],
    yearBuilt: 2012,
    cabins: 4,
  },
];

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;

  await seedSearchWorld(db);
  await db.insert(listing).values(
    DOCS.map((doc) => ({
      id: `lst_${doc.slug}`,
      slug: doc.slug,
      title: doc.slug,
      operatorId: "op_test",
      homeBaseId: "base_test",
      status: "published" as const,
    })),
  );
  await db.insert(listingSearchDoc).values(
    DOCS.map((doc) => ({
      listingId: `lst_${doc.slug}`,
      slug: doc.slug,
      title: doc.slug,
      operator: doc.operator,
      baseId: `base_${doc.slug}`,
      baseName: doc.baseName,
      location: doc.region,
      region: doc.region,
      country: doc.country,
      category: doc.category,
      model: doc.model,
      crewType: doc.crewType,
      amenities: doc.amenities,
      yearBuilt: doc.yearBuilt,
      cabins: doc.cabins,
      rating: "4.50",
      searchableText: `${doc.slug} ${doc.model} ${doc.operator}`,
      priceFromMinor: 300_000,
      priceFromMinorEur: 300_000,
      currency: "EUR",
    })),
  );
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

const counts = (options: ListingFacetOption[]) =>
  Object.fromEntries(options.map((option) => [option.label, option.count]));

const facetsFor = (input: ListingSearchInput) => listSearchFacets(test.db, input);

describe("listSearchFacets", () => {
  it("counts each list without its own filter and under every other", async () => {
    const facets = await facetsFor({ country: ["croatia"], boatType: ["catamaran"] });

    expect(counts(facets.options.countries)).toEqual({ Croatia: 2, Greece: 1 });
    expect(counts(facets.options.sailingAreas)).toEqual({ Dubrovnik: 1, Split: 1 });
    expect(counts(facets.options.boatTypes)).toEqual({ Catamaran: 2, "Sailing yacht": 1 });
    expect(counts(facets.options.charterCompanies)).toEqual({ "Alpha Charter": 2 });
    expect(counts(facets.options.equipment)).toEqual({ Autopilot: 1, Bimini: 2 });
    expect(facets.ranges.cabins).toEqual({ min: 4, max: 5 });
  });

  it("drops a boat that fails the filters of two different lists from all of them", async () => {
    const facets = await facetsFor({ country: ["croatia"], crew: ["crewed"] });

    expect(counts(facets.options.countries)).toEqual({ Croatia: 1 });
    expect(counts(facets.options.crews)).toEqual({ bareboat: 2, crewed: 1 });
    expect(counts(facets.options.models)).toEqual({ "Bavaria 46": 1 });
    expect(facets.ranges.cabins).toEqual({ min: 3, max: 3 });
  });

  it("leaves the destination text out of the place lists only", async () => {
    const facets = await facetsFor({ destination: "Split" });

    expect(counts(facets.options.countries)).toEqual({ Croatia: 3, Greece: 2 });
    expect(counts(facets.options.sailingAreas)).toEqual({ Athens: 2, Dubrovnik: 1, Split: 2 });
    expect(counts(facets.options.charterCompanies)).toEqual({
      "Alpha Charter": 1,
      "Beta Yachting": 1,
    });
  });

  it("lists equipment and years past their own filters, once per boat", async () => {
    const facets = await facetsFor({ equipment: ["autopilot"], yearFrom: 2014 });

    expect(counts(facets.options.equipment)).toEqual({ Autopilot: 2, Bimini: 2 });
    /* The list is cut to the year range, which does read the year filter. */
    expect(facets.options.years.map((option) => option.value)).toEqual(["any", "2018", "2015"]);
    expect(counts(facets.options.boatTypes)).toEqual({ Catamaran: 1, "Sailing yacht": 1 });
  });

  it("keeps the model list apart from the free-text query it ignores", async () => {
    const facets = await facetsFor({ query: "lagoon", model: ["bavaria-46"] });

    expect(counts(facets.options.models)).toEqual({
      "Bali 4.6": 1,
      "Bavaria 46": 2,
      "Lagoon 42": 2,
    });
    expect(counts(facets.options.countries)).toEqual({});
  });

  it("cuts the equipment list to the curated allowlist once one exists", async () => {
    await test.db
      .insert(facetMedia)
      .values({ kind: "equipment", value: "Autopilot", filterVisible: true });

    const facets = await facetsFor({});

    expect(counts(facets.options.equipment)).toEqual({ Autopilot: 3 });
  });
});
