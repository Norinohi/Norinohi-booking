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
 * A length the visitor chose, with and without a date. Every listing the filter admits has to
 * come back with a charter of exactly that length, or the card falls back to a week.
 *
 *   saturdays   Saturday to Saturday, a week at least: sells 7, never 1 or 3
 *   anyday      any weekday, a night at least: sells 1 and 3
 *   norule      publishes no rule: nothing it stated refuses 1 or 3
 *   booked      any weekday, but only two nights are free
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

async function lengths(input: Partial<ListingSearchInput>) {
  const result = await searchListings(test.db, { locale: "en", sort: "newest", ...input });
  return Object.fromEntries(
    result.items.map((item) => [
      item.slug,
      item.nearestCheckIn && item.nearestCheckOut
        ? (Date.parse(item.nearestCheckOut) - Date.parse(item.nearestCheckIn)) / 86_400_000
        : null,
    ]),
  );
}

describe("a length with no date", () => {
  it("admits only boats with a free charter of that length, and names one", async () => {
    expect(await lengths({ duration: 1 })).toEqual({ anyday: 1, norule: 1, booked: 1 });
    expect(await lengths({ duration: 3 })).toEqual({ anyday: 3, norule: 3 });
    expect(await lengths({ duration: 7 })).toEqual({ saturdays: 7, anyday: 7, norule: 7 });
  });
});

describe("a length with a date", () => {
  it("admits boats without a check-in weekday on a day they sell", async () => {
    const monday = shiftIso(SAT, 2);
    expect(Object.keys(await lengths({ startDate: monday, duration: 1 })).sort()).toEqual([
      "anyday",
      "norule",
    ]);
  });
});
