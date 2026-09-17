import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { facetMedia, facetMediaTranslation, listing, listingSearchDoc } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import { seedSearchWorld } from "../test-support/search-fixture";
import { searchListings } from "./repository";
import { listSearchSuggestions } from "./suggestions";

/*
 * The Split typeahead as the synced catalogue has it: a NauSYS base whose vendor location repeats
 * the marina name and whose town is mapped, and Booking Manager boats whose vendor location is
 * "Split" with no town at all.
 */
const boats = [
  {
    slug: "ns-1",
    baseName: "ACI Marina Split",
    location: "ACI Marina Split",
    city: "Split",
    region: "Split region",
  },
  {
    slug: "ns-2",
    baseName: "ACI Marina Split",
    location: "ACI Marina Split",
    city: "Split",
    region: "Split region",
  },
  {
    slug: "ns-3",
    baseName: "Marina Kaštela",
    location: "Marina Kastela",
    city: "Kaštela",
    region: "Split region",
  },
  {
    slug: "bm-1",
    baseName: "Port of Split / West Harbour",
    location: "Split",
    city: null,
    region: "Southern Europe",
  },
];

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);

  for (const boat of boats) {
    await db.insert(listing).values({
      id: `lst_${boat.slug}`,
      slug: boat.slug,
      title: boat.slug,
      operatorId: "op_test",
      homeBaseId: "base_test",
      status: "published",
    });
    await db.insert(listingSearchDoc).values({
      listingId: `lst_${boat.slug}`,
      slug: boat.slug,
      title: boat.slug,
      operator: "Test Charter",
      baseId: "base_test",
      baseName: boat.baseName,
      city: boat.city,
      location: boat.location,
      region: boat.region,
      country: "Croatia",
      rating: "0",
      searchableText: boat.slug,
    });
  }

  const [region] = await db
    .insert(facetMedia)
    .values({ kind: "region", value: "Split region" })
    .returning();
  const [country] = await db
    .insert(facetMedia)
    .values({ kind: "country", value: "Croatia", popularRank: 1 })
    .returning();
  await db.insert(facetMediaTranslation).values([
    { facetMediaId: region!.id, locale: "uk", label: "Спліцький регіон" },
    { facetMediaId: country!.id, locale: "uk", label: "Хорватія" },
  ]);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("listSearchSuggestions", () => {
  it("offers each place once, broadest first, the region included", async () => {
    const suggestions = await listSearchSuggestions(test.db, "Split");
    expect(suggestions.map(({ kind, value }) => `${kind}:${value}`)).toEqual([
      "region:split-region",
      "city:split",
      "base:aci-marina-split",
      "base:port-of-split-west-harbour",
    ]);
  });

  it("offers a city whose filter finds the boats it was counted from", async () => {
    const [city] = (await listSearchSuggestions(test.db, "Split")).filter(
      (suggestion) => suggestion.kind === "city",
    );
    const result = await searchListings(test.db, { city: [city!.value], locale: "en" });
    expect(result.items.map((item) => item.slug).toSorted()).toEqual(["ns-1", "ns-2"]);
  });

  it("matches a town typed without its accents", async () => {
    const suggestions = await listSearchSuggestions(test.db, "Kastela");
    expect(suggestions.map(({ kind, label }) => `${kind}:${label}`)).toEqual([
      "city:Kaštela",
      "base:Marina Kaštela",
    ]);
  });

  it("labels and matches in the visitor's language", async () => {
    const byLocalName = await listSearchSuggestions(test.db, "Спліцький", "uk");
    expect(byLocalName).toEqual([
      { kind: "region", label: "Спліцький регіон", value: "split-region" },
    ]);

    const popular = await listSearchSuggestions(test.db, "", "uk");
    expect(popular).toEqual([
      { kind: "country", label: "Хорватія", value: "croatia", popular: true },
    ]);
  });
});
