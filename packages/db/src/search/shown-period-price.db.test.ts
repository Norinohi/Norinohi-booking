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
import { listMapMarinas } from "./map";
import { rebuildListingSearchDocs } from "./read-model";
import { listSearchFacets, searchListings } from "./repository";
import type { ListingSearchInput } from "./types";

/*
 * A flexible search prices the charter each card names, which is not always the one asked for.
 *
 * The search asks for a Wednesday week, give or take three days, so a boat that turns around on
 * Saturdays is shown the Saturday week instead.
 *
 *   asked         no rules, the vendor priced the Wednesday week itself
 *   askedList     no rules, only the operator's list prices the Wednesday week
 *   nearbyVendor  Saturday to Saturday, the vendor priced the Saturday week
 *   booked        no rules, booked over the Wednesday week, the vendor priced the Saturday week
 *   nearbyList    Saturday to Saturday, only the operator's list prices the Saturday week
 *   unpriced      Saturday to Saturday, its only rate is the Booking Manager week ending that
 *                 Saturday, so nothing prices the week the card shows
 */

const SATURDAY = isoDay(saturdayAhead());
const WEDNESDAY = shiftIso(SATURDAY, -3);
const END = shiftIso(SATURDAY, 28);
const SATURDAY_RULE = [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }];

const flexible: ListingSearchInput = {
  sailingArea: ["Split"],
  startDate: WEDNESDAY,
  duration: 7,
  dateFlexibility: "1-3-days",
  priceBasis: "base",
  locale: "en",
};

let test: TestDatabase;

async function vendorWeek(listingId: string, offerId: string, from: string, priceMinor: number) {
  await test.db.insert(availabilitySlot).values({
    listingId,
    listingOfferId: offerId,
    startDate: from,
    endDate: shiftIso(from, 7),
    status: "available",
    priceMinor,
    obligatoryExtrasMinor: 0,
    currency: "EUR",
  });
}

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;

  await seedSearchWorld(db);
  await db.update(base).set({ lat: 43.51, lng: 16.44 }).where(eq(base.id, "base_test"));

  const asked = await seedListing(db, "asked", {
    free: { from: shiftIso(WEDNESDAY, -7), to: END },
    weeklyRateMinor: 900_000,
    rating: "3.00",
  });
  await vendorWeek(asked.listingId, asked.offerId, WEDNESDAY, 500_000);

  await seedListing(db, "askedList", {
    free: { from: shiftIso(WEDNESDAY, -7), to: END },
    weeklyRateMinor: 300_000,
    rating: "3.00",
  });

  const nearbyVendor = await seedListing(db, "nearbyVendor", {
    providerId: "prov_bm",
    free: { from: SATURDAY, to: END },
    rules: SATURDAY_RULE,
    weeklyRateMinor: 900_000,
    rating: "5.00",
  });
  await vendorWeek(nearbyVendor.listingId, nearbyVendor.offerId, SATURDAY, 450_000);

  const booked = await seedListing(db, "booked", {
    free: { from: SATURDAY, to: END },
    weeklyRateMinor: 900_000,
    rating: "5.00",
  });
  await db.insert(availabilitySlot).values({
    listingId: booked.listingId,
    listingOfferId: booked.offerId,
    startDate: shiftIso(SATURDAY, -7),
    endDate: SATURDAY,
    status: "occupied",
    currency: "EUR",
  });
  await vendorWeek(booked.listingId, booked.offerId, SATURDAY, 200_000);

  await seedListing(db, "nearbyList", {
    free: { from: shiftIso(SATURDAY, -7), to: END },
    rules: SATURDAY_RULE,
    weeklyRateMinor: 350_000,
    rating: "5.00",
  });

  await seedListing(db, "unpriced", {
    providerId: "prov_bm",
    free: { from: SATURDAY, to: END },
    rules: SATURDAY_RULE,
    rates: [{ from: shiftIso(SATURDAY, -7), to: SATURDAY, priceMinor: 100_000 }],
    rating: "5.00",
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

describe("a flexible search prices the charter each card names", () => {
  it("prices the Saturday week a Saturday boat is shown, from its vendor", async () => {
    const card = (await bySlug(flexible)).get("nearbyVendor");
    expect(card).toMatchObject({
      sellsRequestedPeriod: false,
      nearestCheckIn: SATURDAY,
      bookableFrom: SATURDAY,
      bookableTo: shiftIso(SATURDAY, 7),
      pricedForDates: true,
      pricedForNearbyDates: true,
      priceSource: "vendor",
      basePriceFromMinor: 450_000,
    });
  });

  it("names the week a boat without rules sells when the week asked for is booked", async () => {
    const card = (await bySlug(flexible)).get("booked");
    expect(card).toMatchObject({
      sellsRequestedPeriod: false,
      nearestCheckIn: SATURDAY,
      bookableFrom: SATURDAY,
      priceSource: "vendor",
      pricedForNearbyDates: true,
      basePriceFromMinor: 200_000,
    });
  });

  it("prices the Saturday week from the operator's list where no vendor priced it", async () => {
    const card = (await bySlug(flexible)).get("nearbyList");
    expect(card).toMatchObject({
      sellsRequestedPeriod: false,
      nearestCheckIn: SATURDAY,
      bookableFrom: SATURDAY,
      bookableTo: shiftIso(SATURDAY, 7),
      pricedForDates: true,
      pricedForNearbyDates: true,
      priceSource: "price-list",
      basePriceFromMinor: 350_000,
    });
  });

  it("keeps the dates asked for, and their price, where the boat sells them", async () => {
    const cards = await bySlug(flexible);
    expect(cards.get("asked")).toMatchObject({
      sellsRequestedPeriod: true,
      bookableFrom: WEDNESDAY,
      priceSource: "vendor",
      pricedForNearbyDates: false,
      basePriceFromMinor: 500_000,
    });
    expect(cards.get("askedList")).toMatchObject({
      sellsRequestedPeriod: true,
      bookableFrom: WEDNESDAY,
      priceSource: "price-list",
      pricedForNearbyDates: false,
      basePriceFromMinor: 300_000,
    });
  });

  it("leaves a shown week nobody priced on request", async () => {
    const card = (await bySlug(flexible)).get("unpriced");
    expect(card).toMatchObject({
      nearestCheckIn: SATURDAY,
      pricedForDates: false,
      priceSource: null,
    });
  });

  it("recommends prices for the dates asked for, then nearby prices, then the rest", async () => {
    const expected = ["asked", "askedList", "nearbyVendor", "booked", "nearbyList", "unpriced"];
    const { items } = await searchListings(test.db, { ...flexible, sort: "recommended" });
    expect(items.map((item) => item.slug)).toEqual(expected);

    const slugs: string[] = [];
    let cursor: string | undefined = encodeSearchCursor({ value: 100, listingId: "~" });
    do {
      const page = await searchListings(test.db, {
        ...flexible,
        sort: "recommended",
        limit: 2,
        cursor,
      });
      slugs.push(...page.items.map((item) => item.slug));
      cursor = page.nextCursor;
    } while (cursor);
    expect(slugs).toEqual(expected);
  });

  it("sorts by price on the figure each card shows, wherever its week falls", async () => {
    const { items } = await searchListings(test.db, { ...flexible, sort: "price-asc" });
    expect(items.map((item) => item.slug)).toEqual([
      "booked",
      "askedList",
      "nearbyList",
      "nearbyVendor",
      "asked",
      "unpriced",
    ]);
  });

  it("filters, bounds the slider and prices the map pin on the figure each card shows", async () => {
    const { items } = await searchListings(test.db, { ...flexible, maxPriceMinor: 360_000 });
    expect(items.map((item) => item.slug).sort()).toEqual(["askedList", "booked", "nearbyList"]);

    const facets = await listSearchFacets(test.db, flexible);
    expect(facets.priceRange.minMinor).toBe(200_000);

    const [marina] = await listMapMarinas(test.db, flexible);
    expect(marina?.priceFromMinor).toBe(200_000);
  });

  it("prices only the dates asked for on a search without flexibility", async () => {
    const cards = await bySlug({ ...flexible, dateFlexibility: "on-day" });
    for (const card of cards.values()) {
      if (card.pricedForDates) expect(card.bookableFrom).toBe(WEDNESDAY);
      expect(card.pricedForNearbyDates).toBe(false);
    }
  });
});
