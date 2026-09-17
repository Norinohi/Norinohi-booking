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
 * A dated week nobody quoted, priced from the operator's published list for that week.
 *
 *   listed    NauSYS, a band of check-in days covering the searched Saturday, plus a flat
 *             obligatory fee; well rated
 *   cheap     NauSYS, the same, cheaper and with no fee; well rated
 *   quoted    Booking Manager, the vendor priced the searched week itself; rated lowest
 *   lapsed    Booking Manager, its only rate row is the week ending on the searched Saturday
 */

const WEEK_BEFORE = isoDay(saturdayAhead());
const CHECK_IN = shiftIso(WEEK_BEFORE, 7);
const CHECK_OUT = shiftIso(CHECK_IN, 7);
const END = shiftIso(CHECK_IN, 28);

const dated: ListingSearchInput = {
  sailingArea: ["Split"],
  startDate: CHECK_IN,
  duration: 7,
  priceBasis: "base",
  locale: "en",
};

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;

  await seedSearchWorld(db);
  await db.update(base).set({ lat: 43.51, lng: 16.44 }).where(eq(base.id, "base_test"));
  const listed = await seedListing(db, "listed", {
    free: { from: WEEK_BEFORE, to: END },
    rules: [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }],
    rates: [
      { from: WEEK_BEFORE, to: shiftIso(CHECK_IN, -1), priceMinor: 300_000 },
      { from: CHECK_IN, to: shiftIso(CHECK_IN, 6), priceMinor: 520_000 },
    ],
    rating: "4.90",
  });
  await db.insert(providerExtraCatalogue).values({
    listingId: listed.listingId,
    listingOfferId: listed.offerId,
    source: "nausys",
    kind: "service",
    externalId: "cleaning",
    name: "Final cleaning",
    obligatory: true,
    priceMinor: 15_000,
    priceMeasure: "per booking",
  });

  await seedListing(db, "cheap", {
    free: { from: WEEK_BEFORE, to: END },
    rules: [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }],
    rates: [{ from: WEEK_BEFORE, to: END, priceMinor: 350_000 }],
    rating: "4.80",
  });

  const quoted = await seedListing(db, "quoted", {
    providerId: "prov_bm",
    free: { from: WEEK_BEFORE, to: END },
    rules: [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }],
    rates: [{ from: CHECK_IN, to: CHECK_OUT, priceMinor: 600_000 }],
    rating: "3.00",
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

  await seedListing(db, "lapsed", {
    providerId: "prov_bm",
    free: { from: WEEK_BEFORE, to: END },
    rates: [{ from: WEEK_BEFORE, to: CHECK_IN, priceMinor: 100_000 }],
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

describe("a dated week priced from the operator's list", () => {
  it("prices a boat with only a price list at the band covering the check-in day", async () => {
    const listed = (await bySlug(dated)).get("listed");
    expect(listed).toMatchObject({
      priceSource: "price-list",
      pricedForDates: true,
      priceIsFrom: false,
      basePriceFromMinor: 520_000,
      priceFromMinor: 535_000,
      listPriceFromMinor: null,
      bookableFrom: CHECK_IN,
      bookableTo: CHECK_OUT,
      bestOfferId: "off_listed",
    });
  });

  it("keeps the vendor's own price for the week over its list rate", async () => {
    const quoted = (await bySlug(dated)).get("quoted");
    expect(quoted).toMatchObject({
      priceSource: "vendor",
      pricedForDates: true,
      basePriceFromMinor: 450_000,
      priceFromMinor: 470_000,
    });
  });

  it("leaves a boat on request where no rate covers the check-in day", async () => {
    const lapsed = (await bySlug(dated)).get("lapsed");
    expect(lapsed).toMatchObject({ priceSource: null, pricedForDates: false });
  });

  it("estimates no other length that the rules refuse or no rate covers", async () => {
    const shorter = await bySlug({ ...dated, duration: 6 });
    expect(shorter.size).toBeGreaterThan(0);
    for (const item of shorter.values()) {
      expect(item.priceSource).toBeNull();
    }
  });

  it("recommends the vendor's price first, then list rates, then the rest", async () => {
    const { items } = await searchListings(test.db, { ...dated, sort: "recommended" });
    expect(items.map((item) => item.slug)).toEqual(["quoted", "listed", "cheap", "lapsed"]);
  });

  it("pages the recommended order by cursor without skipping or repeating", async () => {
    const slugs: string[] = [];
    /* Above every recommended value, so the first page starts at the top of the order. */
    let cursor: string | undefined = encodeSearchCursor({ value: 1000, listingId: "~" });
    do {
      const page = await searchListings(test.db, {
        ...dated,
        sort: "recommended",
        limit: 1,
        cursor,
      });
      slugs.push(...page.items.map((item) => item.slug));
      cursor = page.nextCursor;
    } while (cursor);
    expect(slugs).toEqual(["quoted", "listed", "cheap", "lapsed"]);
  });

  it("sorts by price on the figure each card shows", async () => {
    const { items } = await searchListings(test.db, { ...dated, sort: "price-asc" });
    expect(items.map((item) => [item.slug, item.basePriceFromMinor])).toEqual([
      ["cheap", 350_000],
      ["quoted", 450_000],
      ["listed", 520_000],
      ["lapsed", 100_000],
    ]);
  });

  it("filters and bounds the slider on the figure each card shows", async () => {
    const { items } = await searchListings(test.db, { ...dated, maxPriceMinor: 460_000 });
    expect(items.map((item) => item.slug)).toEqual(["quoted", "cheap"]);

    const facets = await listSearchFacets(test.db, dated);
    expect(facets.priceRange).toMatchObject({ minMinor: 350_000, maxMinor: 520_000 });
  });

  it("prices the marina pin from the cheapest card priced for the week", async () => {
    const [marina] = await listMapMarinas(test.db, dated);
    expect(marina?.priceFromMinor).toBe(350_000);
  });
});
