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
import { encodeSearchCursor } from "./cursor";
import { rebuildListingSearchDocs } from "./read-model";
import { searchListings } from "./repository";
import type { ListingSearchInput } from "./types";

/*
 * A length with no date, where the charter a card names was priced by nobody but its operator's
 * list, as it is for most of the catalogue.
 *
 *   quoted     Saturdays, the vendor priced the first week; rated lowest
 *   listed     Saturdays, only a weekly list rate
 *   anyday     any weekday, only a weekly list rate, so five nights are an estimate from it and
 *              three are too short for one
 *   later      Booking Manager, Saturdays, free from the first one, where its last band ends, and
 *              listed again only from the week after
 */

const SAT = isoDay(saturdayAhead());
const END = shiftIso(SAT, 28);
const SATURDAYS = [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }];

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);

  const quoted = await seedListing(db, "quoted", {
    free: { from: SAT, to: END },
    rules: SATURDAYS,
    weeklyRateMinor: 600_000,
    rating: "3.00",
  });
  await db.insert(availabilitySlot).values({
    listingId: quoted.listingId,
    listingOfferId: quoted.offerId,
    startDate: SAT,
    endDate: shiftIso(SAT, 7),
    status: "available",
    priceMinor: 450_000,
    obligatoryExtrasMinor: 0,
    currency: "EUR",
  });
  await seedListing(db, "listed", {
    free: { from: SAT, to: END },
    rules: SATURDAYS,
    weeklyRateMinor: 350_000,
    rating: "4.00",
  });
  await seedListing(db, "anyday", {
    free: { from: SAT, to: END },
    rules: [{ minNights: 1 }],
    weeklyRateMinor: 700_000,
    rating: "3.50",
  });
  await seedListing(db, "later", {
    providerId: "prov_bm",
    free: { from: SAT, to: END },
    rules: SATURDAYS,
    rates: [
      { from: shiftIso(SAT, -7), to: SAT, priceMinor: 300_000 },
      { from: shiftIso(SAT, 7), to: END, priceMinor: 380_000 },
    ],
    rating: "2.00",
  });

  await rebuildListingSearchDocs(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

async function cards(input: ListingSearchInput) {
  const { items } = await searchListings(test.db, { locale: "en", priceBasis: "base", ...input });
  return new Map(items.map((item) => [item.slug, item]));
}

describe("a length with no date priced from the operator's list", () => {
  it("prices the week a card names at its list rate, on those dates", async () => {
    const listed = (await cards({ duration: 7 })).get("listed");
    expect(listed).toMatchObject({
      priceSource: "price-list",
      priceIsFrom: false,
      basePriceFromMinor: 350_000,
      bookableFrom: listed?.nearestCheckIn,
      bookableTo: listed?.nearestCheckOut,
    });
    expect(listed?.nearestCheckIn).not.toBeNull();
  });

  it("keeps the vendor's own price where the sweep priced the charter", async () => {
    expect((await cards({ duration: 7 })).get("quoted")).toMatchObject({
      priceSource: "vendor",
      basePriceFromMinor: 450_000,
      bookableFrom: SAT,
    });
  });

  it("estimates another length from the list, captioned as NauSYS's estimate", async () => {
    const anyday = (await cards({ duration: 5 })).get("anyday");
    expect(anyday).toMatchObject({
      priceSource: "price-list-estimate-from",
      priceIsFrom: false,
      basePriceFromMinor: 500_000,
      bookableTo: anyday?.nearestCheckOut,
    });
  });

  it("names the first charter the list prices where the nearest one it sells is not listed", async () => {
    expect((await cards({ duration: 7 })).get("later")).toMatchObject({
      priceSource: "price-list",
      basePriceFromMinor: 380_000,
      nearestCheckIn: shiftIso(SAT, 7),
      nearestCheckOut: shiftIso(SAT, 14),
      bookableFrom: shiftIso(SAT, 7),
    });
  });

  it("leaves a charter too short to estimate unpriced", async () => {
    const anyday = (await cards({ duration: 3 })).get("anyday");
    expect(anyday?.nearestCheckIn).not.toBeNull();
    expect(anyday?.priceSource).toBeUndefined();
    expect(anyday?.bookableTo).not.toBe(anyday?.nearestCheckOut);
  });

  it("recommends vendor prices before list rates, on every page", async () => {
    const input: ListingSearchInput = { locale: "en", duration: 7, sort: "recommended" };
    const expected = ["quoted", "listed", "anyday", "later"];
    const { items } = await searchListings(test.db, input);
    expect(items.map((item) => item.slug)).toEqual(expected);

    const slugs: string[] = [];
    let cursor: string | undefined = encodeSearchCursor({ value: 1000, listingId: "~" });
    do {
      const page = await searchListings(test.db, { ...input, limit: 1, cursor });
      slugs.push(...page.items.map((item) => item.slug));
      cursor = page.nextCursor;
    } while (cursor);
    expect(slugs).toEqual(expected);
  });
});
