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
import { listShortCharterPeriods, searchListings } from "./repository";
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
  const anyday = await seedListing(db, "anyday", {
    free: { from: SAT, to: END },
    rules: [{ minNights: 1 }],
    rating: "3.00",
  });
  /* The vendor priced both the night its card stores and the three nights a "3 days" card names. */
  await db.insert(availabilitySlot).values(
    [
      [1, 100_000],
      [3, 250_000],
    ].map(([nights, price]) => ({
      listingId: anyday.listingId,
      listingOfferId: anyday.offerId,
      startDate: SAT,
      endDate: shiftIso(SAT, nights!),
      status: "available" as const,
      priceMinor: price!,
      obligatoryExtrasMinor: 0,
      currency: "EUR",
    })),
  );
  const norule = await seedListing(db, "norule", { free: { from: SAT, to: END }, rating: "5.00" });
  /* Priced for a week only, so a "3 days" card names three nights nobody priced. */
  await db.insert(availabilitySlot).values({
    listingId: norule.listingId,
    listingOfferId: norule.offerId,
    startDate: SAT,
    endDate: shiftIso(SAT, 7),
    status: "available",
    priceMinor: 500_000,
    obligatoryExtrasMinor: 0,
    currency: "EUR",
  });
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

describe("the short charters the sweep is asked to price", () => {
  it("groups the charters those cards name, with the hulls naming each", async () => {
    const periods = await listShortCharterPeriods(test.db, {
      providerCode: "nausys",
      lengths: [1, 3],
      perLength: 10,
    });

    expect(periods.map((period) => ({ ...period, yachtIds: [...period.yachtIds].sort() }))).toEqual(
      [
        {
          startDate: SAT,
          endDate: shiftIso(SAT, 1),
          listings: 3,
          yachtIds: ["anyday", "booked", "norule"],
        },
        { startDate: SAT, endDate: shiftIso(SAT, 3), listings: 2, yachtIds: ["anyday", "norule"] },
      ],
    );
  });

  it("names nothing for a vendor none of those cards are priced from", async () => {
    expect(
      await listShortCharterPeriods(test.db, {
        providerCode: "booking_manager",
        lengths: [1],
        perLength: 10,
      }),
    ).toEqual([]);
  });
});

describe("the price on a card a length names", () => {
  it("is the vendor's price for that charter where the sweep priced it", async () => {
    const card = async (duration: number) =>
      (await searchListings(test.db, { locale: "en", priceBasis: "base", duration })).items.find(
        (item) => item.slug === "anyday",
      );

    expect(await card(1)).toMatchObject({
      basePriceFromMinor: 100_000,
      bookableTo: shiftIso(SAT, 1),
    });
    expect(await card(3)).toMatchObject({
      basePriceFromMinor: 250_000,
      priceIsFrom: false,
      bookableFrom: SAT,
      bookableTo: shiftIso(SAT, 3),
    });
  });
});

describe("recommending cards a length names", () => {
  it("ranks a card priced for its charter above a better-rated one on request, on every page", async () => {
    const input: ListingSearchInput = { locale: "en", duration: 3, sort: "recommended" };
    const { items } = await searchListings(test.db, input);
    expect(items.map((item) => [item.slug, item.nearestCheckIn])).toEqual([
      ["anyday", SAT],
      ["norule", expect.any(String)],
    ]);
    expect(items.map((item) => item.basePriceFromMinor)).toEqual([250_000, 500_000]);

    const slugs: string[] = [];
    let cursor: string | undefined = encodeSearchCursor({ value: 100, listingId: "~" });
    do {
      const page = await searchListings(test.db, { ...input, limit: 1, cursor });
      slugs.push(...page.items.map((item) => item.slug));
      cursor = page.nextCursor;
    } while (cursor);
    expect(slugs).toEqual(["anyday", "norule"]);
  });
});
