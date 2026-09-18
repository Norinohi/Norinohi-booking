import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { amenity, amenityCategory, facetMedia, listingAmenity } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import {
  isoDay,
  saturdayAhead,
  seedListing,
  seedSearchWorld,
  shiftIso,
} from "../test-support/search-fixture";
import { readListingAmenities } from "./listing-detail";

/*
 * The yacht page's equipment list: one row per fitting however many vendor spellings of it the
 * listing carries. The two Autopilot rows below stand for NauSYS and Booking Manager publishing
 * the same fitting under their own taxonomies.
 */

let test: TestDatabase;
let listingId: string;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);
  const from = isoDay(saturdayAhead());
  const seeded = await seedListing(db, "detail-amenities", {
    free: { from, to: shiftIso(from, 28) },
  });
  listingId = seeded.listingId;

  await db.insert(amenityCategory).values([
    { id: "amc_nav", name: "Navigation" },
    { id: "amc_misc", name: "Miscellaneous" },
  ]);
  await db.insert(amenity).values([
    { id: "amn_ns_autopilot", amenityCategoryId: "amc_nav", name: "Autopilot" },
    {
      id: "amn_bm_autopilot",
      amenityCategoryId: "amc_misc",
      name: "Auto-pilot",
      canonicalName: "Autopilot",
    },
    { id: "amn_bimini", amenityCategoryId: "amc_misc", name: "Bimini" },
  ]);
  await db.insert(listingAmenity).values([
    {
      listingId,
      listingOfferId: seeded.offerId,
      amenityId: "amn_bm_autopilot",
      priceMinor: 5_000,
      priceCurrency: "EUR",
    },
    { listingId, listingOfferId: seeded.offerId, amenityId: "amn_ns_autopilot" },
    { listingId, listingOfferId: seeded.offerId, amenityId: "amn_bimini" },
  ]);
  await db.insert(facetMedia).values([
    { kind: "equipment", value: "autopilot", popularRank: 5 },
    { kind: "equipment", value: "Auto Pilot", popularRank: 2 },
    { kind: "marina", value: "Autopilot", popularRank: 1 },
  ]);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("readListingAmenities", () => {
  it("folds two vendor spellings into one row, the included one winning", async () => {
    const { rows } = await readListingAmenities(test.db, listingId);

    expect(rows.map((row) => row.label)).toEqual(["Autopilot", "Bimini"]);
    expect(rows[0]).toMatchObject({ code: null, priceMinor: null, priceCurrency: null });
  });

  it("merges the categories every spelling is filed under", async () => {
    const { rows } = await readListingAmenities(test.db, listingId);

    expect(rows[0]?.categories).toEqual(["Miscellaneous", "Navigation"]);
    expect(rows[1]?.categories).toEqual(["Miscellaneous"]);
  });

  it("ranks by the lowest equipment rank across spellings, ignoring other facet kinds", async () => {
    const { rows } = await readListingAmenities(test.db, listingId);

    expect(rows[0]?.popularRank).toBe(2);
    expect(rows[1]?.popularRank).toBeNull();
  });
});
