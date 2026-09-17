import "../test-support/checkout-env";

import { user } from "@yacht-charter/db/schema/auth";
import { facetMedia, facetMediaTranslation } from "@yacht-charter/db/schema/facet-media";
import { listing } from "@yacht-charter/db/schema/listing";
import { listingSearchDoc } from "@yacht-charter/db/schema/search";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import {
  saturdayAhead,
  isoDay,
  seedSearchWorld,
  shiftIso,
} from "@yacht-charter/db/test-support/search-fixture";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listingSearchInputSchema } from "../contracts/catalog";
import { searchCharterResults } from "./charter-search";
import { addWishlistItem, listWishlist, presentSavedListings } from "./wishlist";

/*
 * One boat whose charter pack is worth pricing apart: EUR 1,113 for the boat, EUR 1,433 with its
 * obligatory extras. A saved card has to show what the search result for it shows.
 */
const LISTING_ID = "lst_my_affair";
const USER_ID = "usr_wishlist";

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);

  const week = isoDay(saturdayAhead());
  await db.insert(listing).values({
    id: LISTING_ID,
    slug: "my-affair",
    title: "My Affair",
    operatorId: "op_test",
    homeBaseId: "base_test",
    status: "published",
  });
  await db.insert(listingSearchDoc).values({
    listingId: LISTING_ID,
    slug: "my-affair",
    title: "My Affair",
    operator: "Test Charter",
    baseId: "base_test",
    baseName: "Marina Kastela",
    location: "Kastela",
    region: "Split",
    country: "Croatia",
    rating: "0",
    searchableText: "my affair",
    currency: "EUR",
    priceFromMinor: 143_300,
    priceFromMinorEur: 143_300,
    basePriceFromMinor: 111_300,
    basePriceFromMinorEur: 111_300,
    availableFrom: week,
    availableTo: shiftIso(week, 7),
    bookableFrom: week,
    bookableTo: shiftIso(week, 7),
  });

  const [croatia] = await db
    .insert(facetMedia)
    .values({ kind: "country", value: "Croatia" })
    .returning();
  await db
    .insert(facetMediaTranslation)
    .values({ facetMediaId: croatia!.id, locale: "uk", label: "Хорватія" });

  await db.insert(user).values({ id: USER_ID, name: "Saver", email: "saver@example.test" });
  await addWishlistItem(db, USER_ID, LISTING_ID);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

async function searchCard(input: Record<string, string>) {
  const results = await searchCharterResults(test.db, listingSearchInputSchema.parse(input));
  return results.items.find((item) => item.listing.id === LISTING_ID)?.listing;
}

describe("saved listing cards", () => {
  it("price the boat alone by default, as the search results do", async () => {
    const saved = await listWishlist(test.db, USER_ID, { page: 1, pageSize: 10 });
    const [card] = saved.items.map((item) => item.listing);

    expect(card?.priceFrom).toEqual({ amountMinor: 111_300, currency: "EUR" });
    expect(card?.allInPriceFrom).toEqual({ amountMinor: 143_300, currency: "EUR" });
    expect(card?.priceFrom).toEqual((await searchCard({ locale: "en" }))?.priceFrom);
  });

  it("follow a basis the visitor picked", async () => {
    const [card] = await presentSavedListings(test.db, [LISTING_ID], { priceBasis: "all_in" });
    expect(card?.listing.priceFrom).toEqual({ amountMinor: 143_300, currency: "EUR" });
  });

  it("label the card in the visitor's language", async () => {
    const [card] = await presentSavedListings(test.db, [LISTING_ID], { locale: "uk" });
    const searched = await searchCard({ locale: "uk" });
    expect(card?.listing.base.country).toBe("Хорватія");
    expect(card?.listing.base).toEqual(searched?.base);
  });
});
