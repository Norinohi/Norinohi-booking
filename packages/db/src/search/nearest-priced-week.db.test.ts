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
 * A card whose own week no vendor priced used to fall back to the season minimum. Where a vendor
 * priced a later week, the card now shows that week and its price instead.
 *
 *   delta   free from W1, but only W2 is priced by the vendor
 *   echo    free from W1, priced by nobody: keeps the season minimum
 */

const W1 = isoDay(saturdayAhead());
const W2 = shiftIso(W1, 7);
const W3 = shiftIso(W1, 14);
const W4 = shiftIso(W1, 21);

const saturdayWeeks = [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }];

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;

  await seedSearchWorld(db);
  for (const slug of ["delta", "echo"]) {
    await seedListing(db, slug, { free: { from: W1, to: W4 }, rules: saturdayWeeks });
  }

  await db.insert(availabilitySlot).values({
    listingId: "lst_delta",
    listingOfferId: "off_delta",
    startDate: W2,
    endDate: W3,
    status: "available",
    priceMinor: 520_000,
    obligatoryExtrasMinor: 30_000,
    currency: "EUR",
  });

  await rebuildListingSearchDocs(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("a listing whose own week no vendor priced", () => {
  it("shows the nearest priced week instead of the season minimum", async () => {
    const result = await searchListings(test.db, {
      priceBasis: "base",
      locale: "en",
      sort: "price-asc",
    });
    const card = (slug: string) => result.items.find((item) => item.slug === slug);

    expect(card("delta")).toMatchObject({
      basePriceFromMinor: 520_000,
      priceFromMinor: 550_000,
      priceIsFrom: false,
      bookableFrom: W2,
      bookableTo: W3,
    });
    expect(card("echo")).toMatchObject({
      basePriceFromMinor: 400_000,
      priceIsFrom: true,
      bookableFrom: W1,
    });
  });
});
