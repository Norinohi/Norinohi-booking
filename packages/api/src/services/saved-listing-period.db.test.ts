import "../test-support/checkout-env";

import { user } from "@yacht-charter/db/schema/auth";
import { availabilitySlot } from "@yacht-charter/db/schema/availability";
import { rebuildListingSearchDocs } from "@yacht-charter/db/search/read-model";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import {
  isoDay,
  saturdayAhead,
  seedListing,
  seedSearchWorld,
  shiftIso,
} from "@yacht-charter/db/test-support/search-fixture";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listingSearchInputSchema } from "../contracts/catalog";
import { searchCharterResults } from "./charter-search";
import { addWishlistItem, listWishlist, presentSavedListings } from "./wishlist";

/*
 * Saved boats seen through the week the visitor searched.
 *
 *   listed    NauSYS, a cheap first week and a dearer band from the searched Saturday, so its own
 *             nearest charter and the searched week carry different list rates
 *   quoted    Booking Manager, the vendor priced the searched week itself
 *   later     free only from the week after, so the search for that week does not list it
 */

const FIRST_WEEK = isoDay(saturdayAhead());
const CHECK_IN = shiftIso(FIRST_WEEK, 7);
const CHECK_OUT = shiftIso(CHECK_IN, 7);
const END = shiftIso(CHECK_IN, 28);
const SATURDAYS = [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }];
const USER_ID = "usr_saved_period";
const IDS = ["lst_listed", "lst_quoted", "lst_later"];

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);

  await seedListing(db, "listed", {
    free: { from: FIRST_WEEK, to: END },
    rules: SATURDAYS,
    rates: [
      { from: FIRST_WEEK, to: shiftIso(CHECK_IN, -1), priceMinor: 300_000 },
      { from: CHECK_IN, to: END, priceMinor: 520_000 },
    ],
  });
  const quoted = await seedListing(db, "quoted", {
    providerId: "prov_bm",
    free: { from: FIRST_WEEK, to: END },
    rules: SATURDAYS,
    rates: [{ from: FIRST_WEEK, to: END, priceMinor: 600_000 }],
  });
  await db.insert(availabilitySlot).values({
    listingId: quoted.listingId,
    listingOfferId: quoted.offerId,
    startDate: CHECK_IN,
    endDate: CHECK_OUT,
    status: "available",
    priceMinor: 450_000,
    obligatoryExtrasMinor: 20_000,
    currency: "EUR",
  });
  await seedListing(db, "later", {
    free: { from: CHECK_OUT, to: END },
    rules: SATURDAYS,
    rates: [{ from: CHECK_OUT, to: END, priceMinor: 380_000 }],
  });
  await rebuildListingSearchDocs(db);

  await db.insert(user).values({ id: USER_ID, name: "Saver", email: "period@example.test" });
  for (const id of IDS) await addWishlistItem(db, USER_ID, id);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

const searched = { startDate: CHECK_IN, duration: 7, locale: "en" };

async function searchResults() {
  const results = await searchCharterResults(
    test.db,
    listingSearchInputSchema.parse({ ...searched, pageSize: 50 }),
  );
  return new Map(results.items.map((item) => [item.listing.id, item]));
}

describe("saved cards for the searched period", () => {
  it("carry the dates, price and caption the search showed for each boat it lists", async () => {
    const search = await searchResults();
    const saved = await presentSavedListings(test.db, IDS, searched);

    for (const id of ["lst_listed", "lst_quoted"]) {
      expect(saved.find((card) => card.listing.id === id)).toEqual(search.get(id));
    }
    expect(search.get("lst_listed")?.listing.priceSource).toBe("price-list");
    expect(search.get("lst_quoted")?.listing.priceSource).toBe("vendor");
    expect(saved.map((card) => card.listing.id)).toEqual(IDS);
  });

  it("keep the nearest charter for a boat the searched period does not list", async () => {
    const [card] = await presentSavedListings(test.db, ["lst_later"], searched);
    const [undated] = await presentSavedListings(test.db, ["lst_later"], { locale: "en" });
    expect(card).toEqual(undated);
    expect(card).toMatchObject({ checkIn: null, checkOut: null, periodIsAlternative: false });
  });

  it("price the boat's own nearest charter when no period was searched", async () => {
    const [card] = await presentSavedListings(test.db, ["lst_listed"], { locale: "en" });
    expect(card?.checkIn).toBeNull();
    expect(card?.listing.priceFrom?.amountMinor).toBe(300_000);
  });

  it("reach the signed-in wishlist the same way", async () => {
    const page = await listWishlist(test.db, USER_ID, { page: 1, pageSize: 10, ...searched });
    const quoted = page.items.find((item) => item.listing.id === "lst_quoted");
    expect(quoted).toMatchObject({ checkIn: CHECK_IN, checkOut: CHECK_OUT });
    expect(quoted?.listing.priceFrom?.amountMinor).toBe(450_000);
    expect(page.pagination.totalItems).toBe(3);
  });
});
