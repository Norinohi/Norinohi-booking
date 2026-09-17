import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { availabilitySlot } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import {
  isoDay,
  saturdayAhead,
  seedListing,
  seedSearchWorld,
  shiftIso,
} from "../test-support/search-fixture";
import { rebuildListingSearchDocs } from "./read-model";
import { searchListings } from "./repository";
import type { ListingSearchInput } from "./types";

/*
 * The page total is read off the page query itself, so it has to count every match rather than the
 * rows the page returned, and still hold on a page past the last one, which returns no row to read.
 */

const SAT = isoDay(saturdayAhead());
const END = shiftIso(SAT, 28);

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;

  await seedSearchWorld(db);
  await seedListing(db, "saturdays", {
    free: { from: SAT, to: END },
    rules: [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }],
  });
  await seedListing(db, "anyday", { free: { from: SAT, to: END }, rules: [{ minNights: 1 }] });
  await seedListing(db, "norule", { free: { from: SAT, to: END } });
  const booked = await seedListing(db, "booked", {
    free: { from: SAT, to: shiftIso(SAT, 2) },
    rules: [{ minNights: 1 }],
  });
  await db.insert(availabilitySlot).values({
    listingId: booked.listingId,
    listingOfferId: booked.offerId,
    startDate: shiftIso(SAT, 2),
    endDate: END,
    status: "occupied",
  });

  await rebuildListingSearchDocs(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

const searches: [string, Partial<ListingSearchInput>, number][] = [
  ["undated", {}, 4],
  ["dated", { startDate: SAT, duration: 7 }, 3],
  ["lone check-in", { startDate: SAT }, 3],
  ["duration", { duration: 3 }, 2],
];

async function page(input: Partial<ListingSearchInput>, pageNumber: number, pageSize: number) {
  return searchListings(test.db, {
    locale: "en",
    sort: "newest",
    ...input,
    page: pageNumber,
    pageSize,
  });
}

describe("the results total", () => {
  it.each(searches)("counts every %s match, not the page", async (_name, input, expected) => {
    const all = await page(input, 1, 50);
    expect(all.items).toHaveLength(expected);
    expect(all.pagination?.totalItems).toBe(expected);

    const first = await page(input, 1, 1);
    expect(first.items).toHaveLength(1);
    expect(first.pagination).toMatchObject({ totalItems: expected, totalPages: expected });
    expect(first.items[0]).not.toHaveProperty("totalItems");
  });

  it.each(searches)("holds on a page past the last %s match", async (_name, input, expected) => {
    const past = await page(input, expected + 2, 1);
    expect(past.items).toEqual([]);
    expect(past.pagination).toMatchObject({ totalItems: expected, startItem: 0, endItem: 0 });
  });

  it("is zero on an empty first page", async () => {
    const none = await page({ name: "no such boat" }, 1, 10);
    expect(none.items).toEqual([]);
    expect(none.pagination?.totalItems).toBe(0);
  });
});
