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
 * A card says a week is held only when the filter let the boat in because of the hold.
 *
 *   shortcharter  sells Saturday weeks by rule, but the vendor confirmed three free nights, so
 *                 its rules and free period never admit a 3-night search: its own charter does
 *   held          the week asked for is under another customer's option and nothing else
 */

const SAT = isoDay(saturdayAhead());
const END = shiftIso(SAT, 28);
const EXPIRES = new Date(`${shiftIso(SAT, -10)}T12:00:00Z`);

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;

  await seedSearchWorld(db);
  const shortcharter = await seedListing(db, "shortcharter", {
    free: { from: SAT, to: END },
    rules: [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }],
  });
  await db.insert(availabilitySlot).values({
    listingId: shortcharter.listingId,
    listingOfferId: shortcharter.offerId,
    startDate: SAT,
    endDate: shiftIso(SAT, 3),
    status: "available",
    priceMinor: 85_700,
    obligatoryExtrasMinor: 0,
    currency: "EUR",
  });

  const held = await seedListing(db, "held", {
    free: { from: shiftIso(SAT, 7), to: END },
    rates: [{ from: SAT, to: END, priceMinor: 400_000 }],
    rules: [{ minNights: 1 }],
  });
  await db.insert(availabilitySlot).values({
    listingId: held.listingId,
    listingOfferId: held.offerId,
    startDate: SAT,
    endDate: shiftIso(SAT, 7),
    status: "option",
    optionExpiresAt: EXPIRES,
  });

  await rebuildListingSearchDocs(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

async function holds(input: Partial<ListingSearchInput>) {
  const result = await searchListings(test.db, { locale: "en", sort: "newest", ...input });
  return Object.fromEntries(result.items.map((item) => [item.slug, item.temporaryHold]));
}

describe("the temporary hold on a card", () => {
  it("is absent on a boat admitted by its vendor's own short charter", async () => {
    expect(await holds({ startDate: SAT, duration: 3 })).toEqual({ shortcharter: null });
    expect(await holds({ startDate: SAT, duration: 3, underTemporaryBooking: true })).toMatchObject(
      { shortcharter: null },
    );
  });

  it("marks a week held only by an option when the toggle asks for those", async () => {
    expect(await holds({ startDate: SAT, duration: 7, underTemporaryBooking: true })).toEqual({
      shortcharter: null,
      held: { expiresAt: EXPIRES.toISOString().replace(".000", "") },
    });
  });

  it("leaves the option-held week out with the toggle off", async () => {
    expect(await holds({ startDate: SAT, duration: 7 })).not.toHaveProperty("held");
  });
});
