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

/*
 * A charter the vendor priced as free outranks our copy of its rules. The boat below publishes
 * Monday to Monday, and its operator sold it Saturday to Saturday anyway -- the shape one Booking
 * Manager operator's whole fleet was in, with 11,700 priced weeks hidden on the check-in day.
 */

const SAT = isoDay(saturdayAhead());
const NEXT_SAT = shiftIso(SAT, 7);

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;

  await seedSearchWorld(db);
  const boat = await seedListing(db, "mondays", {
    free: { from: SAT, to: shiftIso(SAT, 28) },
    rules: [{ checkinWeekday: 1, checkoutWeekday: 1, minNights: 7 }],
    providerId: "prov_bm",
  });
  await db.insert(availabilitySlot).values({
    listingId: boat.listingId,
    listingOfferId: boat.offerId,
    startDate: SAT,
    endDate: NEXT_SAT,
    status: "available",
    priceMinor: 450_000,
    obligatoryExtrasMinor: 0,
    currency: "EUR",
  });

  await rebuildListingSearchDocs(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

const card = async (input: Parameters<typeof searchListings>[1]) =>
  (await searchListings(test.db, { locale: "en", ...input })).items.find(
    (item) => item.slug === "mondays",
  );

describe("a Saturday week the vendor priced on a Monday-only boat", () => {
  it("is the charter the card advertises, at the vendor's price", async () => {
    expect(await card({ priceBasis: "base" })).toMatchObject({
      bookableFrom: SAT,
      bookableTo: NEXT_SAT,
      basePriceFromMinor: 450_000,
      priceIsFrom: false,
    });
  });

  it("is found by a search for that Saturday, as the dates asked for", async () => {
    expect(await card({ startDate: SAT, duration: 7 })).toMatchObject({
      sellsRequestedPeriod: true,
    });
  });

  it("is named by a week-long search with no date", async () => {
    expect(await card({ duration: 7 })).toMatchObject({ nearestCheckIn: SAT });
  });
});
