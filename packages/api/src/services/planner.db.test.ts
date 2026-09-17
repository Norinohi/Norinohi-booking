import "../test-support/checkout-env";

import { availabilitySlot } from "@yacht-charter/db/schema/availability";
import { rebuildListingSearchDocs } from "@yacht-charter/db/search/read-model";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import {
  isoDay,
  saturdayAhead,
  seedListing,
  seedSearchWorld,
  shiftIso,
} from "@yacht-charter/db/test-support/search-fixture";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { plannerAnswersSchema } from "../contracts/planner";
import { recommendTrip } from "./planner";

/*
 * Three Croatian bareboats, each priced by its vendor for the same week:
 *
 *   cheap   EUR 3,000 the week
 *   mid     EUR 5,000
 *   dear    EUR 9,000
 */
const SAT = isoDay(saturdayAhead());

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);

  for (const [slug, priceMinor] of [
    ["cheap", 300_000],
    ["mid", 500_000],
    ["dear", 900_000],
  ] as const) {
    const { listingId, offerId } = await seedListing(db, slug, {
      free: { from: SAT, to: shiftIso(SAT, 28) },
      rules: [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }],
    });
    await db.insert(availabilitySlot).values({
      listingId,
      listingOfferId: offerId,
      startDate: SAT,
      endDate: shiftIso(SAT, 7),
      status: "available",
      priceMinor,
      obligatoryExtrasMinor: 0,
      currency: "EUR",
    });
  }

  await rebuildListingSearchDocs(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

const brief = (answers: Record<string, string>) =>
  recommendTrip(
    test.db,
    plannerAnswersSchema.parse({
      destination: "croatia",
      experience: "licensed",
      duration: "7",
      ...answers,
    }),
  );

describe("the trip planner's budget", () => {
  it("recommends only yachts the group can afford, per person per week", async () => {
    /* No group size: six guests, so EUR 600 a head is EUR 3,600 the boat. */
    const plan = await brief({ groupSize: "not-sure", budget: "300-600" });

    expect(plan.listing?.slug).toBe("cheap");
    expect(plan.recommendedPerPerson).toEqual({ amountMinor: 50_000, currency: "EUR" });
    expect(plan.estimatedPrice.perBoat.max.amountMinor).toBeLessThanOrEqual(360_000);
    expect(plan.searchParams.maxPriceMinor).toBe(360_000);
  });

  it("falls back to the yacht closest over the budget when none fits", async () => {
    /* Four guests at EUR 600 is EUR 2,400, under every boat in the fleet. */
    const plan = await brief({ groupSize: "2-4", budget: "300-600" });

    expect(plan.listing?.slug).toBe("cheap");
    expect(plan.searchParams.maxPriceMinor).toBeNull();
  });

  it("leaves a brief with no ceiling to the recommended order", async () => {
    const plan = await brief({ groupSize: "not-sure", budget: "2000-plus" });

    expect(plan.matchCount).toBe(3);
    expect(plan.searchParams.maxPriceMinor).toBeNull();
  });
});
