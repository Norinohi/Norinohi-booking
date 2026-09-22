import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listing, listingSearchDoc } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import { seedSearchWorld } from "../test-support/search-fixture";
import { listSimilarListings } from "./listing-detail";

/*
 * A Lefkada catamaran's "other popular yachts". The Croatian catamaran is rated highest of all,
 * which is how it used to lead the strip on the strength of its category alone.
 */
const boats = [
  {
    slug: "self",
    baseId: "lefkada",
    region: "Ionian",
    country: "Greece",
    category: "Catamaran",
    rating: "3",
  },
  {
    slug: "croatia-cat",
    baseId: "split",
    region: "Split region",
    country: "Croatia",
    category: "Catamaran",
    rating: "5",
  },
  {
    slug: "athens-cat",
    baseId: "alimos",
    region: "Saronic",
    country: "Greece",
    category: "Catamaran",
    rating: "4.9",
  },
  {
    slug: "athens-sail",
    baseId: "alimos",
    region: "Saronic",
    country: "Greece",
    category: "Sailing yacht",
    rating: "5",
  },
  {
    slug: "corfu-sail",
    baseId: "corfu",
    region: "Ionian",
    country: "Greece",
    category: "Sailing yacht",
    rating: "4",
  },
  {
    slug: "corfu-cat",
    baseId: "corfu",
    region: "Ionian",
    country: "Greece",
    category: "Catamaran",
    rating: "1",
  },
  {
    slug: "lefkada-sail",
    baseId: "lefkada",
    region: "Ionian",
    country: "Greece",
    category: "Sailing yacht",
    rating: "0",
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
      baseId: boat.baseId,
      baseName: boat.baseId,
      location: boat.baseId,
      region: boat.region,
      country: boat.country,
      category: boat.category,
      rating: boat.rating,
      searchableText: boat.slug,
    });
  }
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("listSimilarListings", () => {
  it("ranks the same base, then region, then country, category breaking ties", async () => {
    const similar = await listSimilarListings(test.db, "lst_self", 10);

    expect(similar.map((doc) => doc.slug)).toEqual([
      "lefkada-sail",
      "corfu-cat",
      "corfu-sail",
      "athens-cat",
      "athens-sail",
    ]);
  });

  it("never reaches another country", async () => {
    const similar = await listSimilarListings(test.db, "lst_self", 10);

    expect(similar.every((doc) => doc.country === "Greece")).toBe(true);
  });
});
