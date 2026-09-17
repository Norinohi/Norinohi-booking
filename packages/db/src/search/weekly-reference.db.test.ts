import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { availabilitySlot, base } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import {
  isoDay,
  saturdayAhead,
  seedListing,
  seedSearchWorld,
  shiftIso,
} from "../test-support/search-fixture";
import { encodeSearchCursor } from "./cursor";
import { rebuildListingSearchDocs } from "./read-model";
import { searchListings } from "./repository";
import type { ListingSearchInput } from "./types";

/*
 * Three nights, which nothing estimates from a weekly list, so only a vendor prices them. The rest
 * carry the operator's weekly rate for the week the charter starts in as a reference.
 *
 *   quoted    NauSYS, the vendor priced the three nights
 *   crossing  Booking Manager, a cheap week ending on the check-in, then 1,050,000 from it
 *   listed    NauSYS, one band across the month at 700,000
 */

const CHECK_IN = shiftIso(isoDay(saturdayAhead()), 7);
const START = shiftIso(CHECK_IN, -7);
const END = shiftIso(CHECK_IN, 28);

const threeNights: ListingSearchInput = {
  sailingArea: ["Split"],
  startDate: CHECK_IN,
  duration: 3,
  priceBasis: "base",
  locale: "en",
};

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;

  await seedSearchWorld(db);
  await db.update(base).set({ lat: 43.51, lng: 16.44 }).where(eq(base.id, "base_test"));

  const quoted = await seedListing(db, "quoted", {
    free: { from: START, to: END },
    weeklyRateMinor: 1_400_000,
    rating: "1.00",
  });
  await db.insert(availabilitySlot).values({
    listingId: quoted.listingId,
    listingOfferId: quoted.offerId,
    startDate: CHECK_IN,
    endDate: shiftIso(CHECK_IN, 3),
    status: "available",
    priceMinor: 300_000,
    obligatoryExtrasMinor: 0,
    currency: "EUR",
  });

  await seedListing(db, "crossing", {
    providerId: "prov_bm",
    free: { from: START, to: END },
    rates: [
      { from: START, to: CHECK_IN, priceMinor: 100_000 },
      { from: CHECK_IN, to: shiftIso(CHECK_IN, 7), priceMinor: 1_050_000 },
    ],
    rating: "5.00",
  });

  await seedListing(db, "listed", {
    free: { from: START, to: END },
    weeklyRateMinor: 700_000,
    rating: "4.00",
  });

  await rebuildListingSearchDocs(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

const bySlug = async (input: ListingSearchInput) => {
  const { items } = await searchListings(test.db, input);
  return new Map(items.map((item) => [item.slug, item]));
};

describe("the weekly reference rate on a card nothing priced", () => {
  it("reads the weekly rate for the week the charter starts in", async () => {
    const cards = await bySlug(threeNights);
    expect(cards.get("listed")).toMatchObject({
      priceSource: null,
      weeklyRateMinor: 700_000,
      weeklyRateCurrency: "EUR",
    });
    /* Booking Manager's rows are half-open, so the week ending on the check-in does not count. */
    expect(cards.get("crossing")).toMatchObject({ priceSource: null, weeklyRateMinor: 1_050_000 });
  });

  it("carries no reference where the vendor priced the charter", async () => {
    const cards = await bySlug(threeNights);
    expect(cards.get("quoted")).toMatchObject({ priceSource: "vendor", weeklyRateMinor: null });
  });

  it("recommends priced cards before those with a reference, and pages the order by cursor", async () => {
    const expected = ["quoted", "crossing", "listed"];
    const { items } = await searchListings(test.db, { ...threeNights, sort: "recommended" });
    expect(items.map((item) => item.slug)).toEqual(expected);

    const slugs: string[] = [];
    let cursor: string | undefined = encodeSearchCursor({ value: 1000, listingId: "~" });
    do {
      const page = await searchListings(test.db, {
        ...threeNights,
        sort: "recommended",
        limit: 1,
        cursor,
      });
      slugs.push(...page.items.map((item) => item.slug));
      cursor = page.nextCursor;
    } while (cursor);
    expect(slugs).toEqual(expected);
  });
});
