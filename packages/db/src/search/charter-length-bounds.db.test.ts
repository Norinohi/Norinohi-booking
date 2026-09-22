import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
 * Weekly bands on boats whose own length bounds refuse a week. The band is still the per-night
 * input to the estimate of the lengths they do sell, and the rules keep the week itself unsold.
 *
 *   fortnight  Booking Manager, Saturdays, a fourteen-night minimum
 *   short      Booking Manager, any day, a five-night maximum
 *   open       Booking Manager, any day, no maximum
 */

const SAT = isoDay(saturdayAhead());
const END = shiftIso(SAT, 28);

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);

  await seedListing(db, "fortnight", {
    providerId: "prov_bm",
    free: { from: SAT, to: END },
    rules: [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 14 }],
    weeklyRateMinor: 400_000,
  });
  await seedListing(db, "short", {
    providerId: "prov_bm",
    free: { from: SAT, to: END },
    rules: [{ minNights: 1, maxNights: 5 }],
    weeklyRateMinor: 700_000,
  });
  await seedListing(db, "open", {
    providerId: "prov_bm",
    free: { from: SAT, to: END },
    rules: [{ minNights: 1 }],
    weeklyRateMinor: 700_000,
  });

  await rebuildListingSearchDocs(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

async function cards(input: Omit<ListingSearchInput, "locale">) {
  const { items } = await searchListings(test.db, { locale: "en", priceBasis: "base", ...input });
  return new Map(items.map((item) => [item.slug, item]));
}

describe("weekly bands on a boat whose bounds refuse a week", () => {
  it("estimates the fortnight a fourteen-night minimum sells from its weekly band", async () => {
    expect((await cards({ startDate: SAT, duration: 14 })).get("fortnight")).toMatchObject({
      priceSource: "price-list-estimate",
      basePriceFromMinor: 800_000,
    });
  });

  it("does not sell that boat the week its minimum refuses", async () => {
    expect((await cards({ startDate: SAT, duration: 7 })).get("fortnight")?.priceSource).not.toBe(
      "price-list",
    );
  });

  it("estimates the five nights a five-night maximum sells", async () => {
    expect((await cards({ startDate: SAT, duration: 5 })).get("short")).toMatchObject({
      priceSource: "price-list-estimate",
      basePriceFromMinor: 525_000,
    });
  });

  it("shows no weekly reference for a boat capped below a week", async () => {
    const shown = await cards({ startDate: SAT, duration: 3 });
    expect(shown.get("short")).toMatchObject({ priceSource: null, weeklyRateMinor: null });
    expect(shown.get("open")).toMatchObject({ priceSource: null, weeklyRateMinor: 700_000 });
  });
});
