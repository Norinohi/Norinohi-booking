import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "../test-support/database";
import { isoDay, seedListing, seedSearchWorld, shiftIso } from "../test-support/search-fixture";
import { rebuildListingSearchDocs } from "./read-model";
import { searchListings } from "./repository";

/*
 * How soon a charter may start, per vendor. Booking Manager refuses anything from tomorrow and
 * NauSYS sells it, so two boats free from today with the same rule name different first days.
 */

const TODAY = isoDay(new Date());
const END = shiftIso(TODAY, 40);
const anyNight = [{ minNights: 1 }];

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;

  await seedSearchWorld(db);
  await seedListing(db, "nausys-boat", { free: { from: TODAY, to: END }, rules: anyNight });
  await seedListing(db, "bm-boat", {
    free: { from: TODAY, to: END },
    rules: anyNight,
    providerId: "prov_bm",
  });

  await rebuildListingSearchDocs(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("the earliest charter a card names", () => {
  it("starts tomorrow on NauSYS and two days out on Booking Manager", async () => {
    const { items } = await searchListings(test.db, { locale: "en", duration: 3 });
    const startOf = (slug: string) => items.find((item) => item.slug === slug)?.nearestCheckIn;

    expect(startOf("nausys-boat")).toBe(shiftIso(TODAY, 1));
    expect(startOf("bm-boat")).toBe(shiftIso(TODAY, 2));
  });

  it("is where the stored charter starts too", async () => {
    const { items } = await searchListings(test.db, { locale: "en" });
    const storedOf = (slug: string) => items.find((item) => item.slug === slug)?.bookableFrom;

    expect(storedOf("nausys-boat")).toBe(shiftIso(TODAY, 1));
    expect(storedOf("bm-boat")).toBe(shiftIso(TODAY, 2));
  });
});
