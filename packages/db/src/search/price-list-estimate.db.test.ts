import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { availabilitySlot, base, providerExtraCatalogue } from "../schema";
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
 * A dated charter of any length but a week, estimated from the operator's weekly list.
 *
 *   estimated  NauSYS, one band across the month at 700,000, and an obligatory fee per night
 *   crossing   Booking Manager, a week at 1,050,000 from the check-in, then a week at 1,400,000
 *   quoted     NauSYS, the vendor priced the six nights itself; its list would read 1,400,000
 *   taken      NauSYS, free on paper, but a booking overlaps the charter
 */

const CHECK_IN = shiftIso(isoDay(saturdayAhead()), 7);
const START = shiftIso(CHECK_IN, -7);
const END = shiftIso(CHECK_IN, 28);

const sixNights: ListingSearchInput = {
  sailingArea: ["Split"],
  startDate: CHECK_IN,
  duration: 6,
  priceBasis: "base",
  locale: "en",
};

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;

  await seedSearchWorld(db);
  await db.update(base).set({ lat: 43.51, lng: 16.44 }).where(eq(base.id, "base_test"));

  const estimated = await seedListing(db, "estimated", {
    free: { from: START, to: END },
    weeklyRateMinor: 700_000,
    rating: "4.00",
  });
  await db.insert(providerExtraCatalogue).values({
    listingId: estimated.listingId,
    listingOfferId: estimated.offerId,
    source: "nausys",
    kind: "service",
    externalId: "moorings",
    name: "Moorings",
    obligatory: true,
    priceMinor: 2_000,
    priceMeasure: "per night",
  });

  await seedListing(db, "crossing", {
    providerId: "prov_bm",
    free: { from: START, to: END },
    rates: [
      { from: START, to: CHECK_IN, priceMinor: 100_000 },
      { from: CHECK_IN, to: shiftIso(CHECK_IN, 7), priceMinor: 1_050_000 },
      { from: shiftIso(CHECK_IN, 7), to: shiftIso(CHECK_IN, 14), priceMinor: 1_400_000 },
    ],
    rating: "5.00",
  });

  const quoted = await seedListing(db, "quoted", {
    free: { from: START, to: END },
    weeklyRateMinor: 1_400_000,
    rating: "3.00",
  });
  await db.insert(availabilitySlot).values({
    listingId: quoted.listingId,
    listingOfferId: quoted.offerId,
    startDate: CHECK_IN,
    endDate: shiftIso(CHECK_IN, 6),
    status: "available",
    priceMinor: 450_000,
    obligatoryExtrasMinor: 0,
    currency: "EUR",
  });

  const taken = await seedListing(db, "taken", {
    free: { from: START, to: END },
    weeklyRateMinor: 70_000,
    rating: "5.00",
  });
  await db.insert(availabilitySlot).values({
    listingId: taken.listingId,
    listingOfferId: taken.offerId,
    startDate: shiftIso(CHECK_IN, 2),
    endDate: shiftIso(CHECK_IN, 4),
    status: "occupied",
    currency: "EUR",
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

describe("a dated charter of another length estimated from the weekly list", () => {
  it("estimates six nights at six sevenths of the week, with fees scaled to six nights", async () => {
    const card = (await bySlug(sixNights)).get("estimated");
    expect(card).toMatchObject({
      priceSource: "price-list-estimate-from",
      pricedForDates: true,
      priceIsFrom: false,
      basePriceFromMinor: 600_000,
      priceFromMinor: 612_000,
      listPriceFromMinor: null,
      bookableFrom: CHECK_IN,
      bookableTo: shiftIso(CHECK_IN, 6),
      bestOfferId: "off_estimated",
    });
  });

  it("adds Booking Manager's short-charter premium under a week", async () => {
    /* Six nights at 150,000, plus 3% */
    expect((await bySlug(sixNights)).get("crossing")).toMatchObject({
      priceSource: "price-list-estimate",
      basePriceFromMinor: 927_000,
    });
    /* Four nights at 150,000, plus 10% */
    expect((await bySlug({ ...sixNights, duration: 4 })).get("crossing")).toMatchObject({
      priceSource: "price-list-estimate",
      basePriceFromMinor: 660_000,
    });
  });

  it("estimates nothing under four nights, leaving the card on request", async () => {
    const cards = await bySlug({ ...sixNights, duration: 3 });
    expect(cards.get("estimated")?.priceSource ?? null).toBeNull();
    expect(cards.get("crossing")?.priceSource ?? null).toBeNull();
    expect(cards.get("estimated")?.pricedForDates).toBe(false);
  });

  it("sums a charter crossing into another row night by night", async () => {
    const cards = await bySlug({ ...sixNights, duration: 10 });
    /* Seven nights at 150,000 and three at 200,000 */
    expect(cards.get("crossing")).toMatchObject({
      priceSource: "price-list-estimate",
      basePriceFromMinor: 1_650_000,
      bookableTo: shiftIso(CHECK_IN, 10),
    });
    expect(cards.get("estimated")).toMatchObject({
      priceSource: "price-list-estimate-before-discounts",
      basePriceFromMinor: 1_000_000,
      priceFromMinor: 1_020_000,
    });
  });

  it("keeps the vendor's own price for the charter over an estimate", async () => {
    expect((await bySlug(sixNights)).get("quoted")).toMatchObject({
      priceSource: "vendor",
      basePriceFromMinor: 450_000,
    });
  });

  it("estimates nothing for a charter something has taken", async () => {
    const taken = (await bySlug(sixNights)).get("taken");
    expect(taken?.priceSource ?? null).toBeNull();
  });

  it("still prices a week from the list rate of the check-in row alone", async () => {
    const week = await bySlug({ ...sixNights, duration: 7 });
    expect(week.get("crossing")).toMatchObject({
      priceSource: "price-list",
      basePriceFromMinor: 1_050_000,
    });
    expect(week.get("estimated")).toMatchObject({
      priceSource: "price-list",
      basePriceFromMinor: 700_000,
      priceFromMinor: 714_000,
    });
  });

  it("recommends the vendor's price, then estimates, then the rest", async () => {
    const expected = ["quoted", "crossing", "estimated", "taken"];
    const { items } = await searchListings(test.db, { ...sixNights, sort: "recommended" });
    expect(items.map((item) => item.slug)).toEqual(expected);

    const slugs: string[] = [];
    let cursor: string | undefined = encodeSearchCursor({ value: 100, listingId: "~" });
    do {
      const page = await searchListings(test.db, {
        ...sixNights,
        sort: "recommended",
        limit: 1,
        cursor,
      });
      slugs.push(...page.items.map((item) => item.slug));
      cursor = page.nextCursor;
    } while (cursor);
    expect(slugs).toEqual(expected);
  });

  it("sorts, filters, bounds the slider and prices the map pin on the estimate", async () => {
    const sorted = await searchListings(test.db, { ...sixNights, sort: "price-asc" });
    expect(sorted.items.map((item) => item.slug)).toEqual([
      "quoted",
      "estimated",
      "crossing",
      "taken",
    ]);

    const filtered = await searchListings(test.db, { ...sixNights, maxPriceMinor: 650_000 });
    expect(filtered.items.map((item) => item.slug).sort()).toEqual(["estimated", "quoted"]);

    const facets = await listSearchFacets(test.db, sixNights);
    expect(facets.priceRange).toMatchObject({ minMinor: 450_000, maxMinor: 927_000 });

    const [marina] = await listMapMarinas(test.db, { ...sixNights, minPriceMinor: 500_000 });
    expect(marina?.priceFromMinor).toBe(600_000);
  });
});
