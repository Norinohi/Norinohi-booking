import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { providerExtraCatalogue } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import {
  isoDay,
  saturdayAhead,
  seedListing,
  seedSearchWorld,
  shiftIso,
} from "../test-support/search-fixture";
import { getListingDetailByIdOrSlug } from "./listing-detail";
import { rebuildListingSearchDocs } from "./read-model";
import { searchListings } from "./repository";
import type { ListingSearchInput } from "./types";

/*
 * Booking Manager fees restricted to routes and bases, each filed under the hull's home base
 * `HOME`, the way the projection files them. `OTHER` is another base of the same fleet.
 *
 *   routed    a return-only APA the card must count, a one-way fee it must not, a charter pack
 *             for a return from another base and a fee sold only at another base
 *   skippered an obligatory skipper for a return from home: a skippered charter
 *   elsewhere an obligatory skipper for a return from another base: still bareboat
 */

const HOME = "194";
const OTHER = "1055942990000100000";
const FROM = isoDay(saturdayAhead());
const WEEKLY_RATE = 400_000;

const search: ListingSearchInput = { sailingArea: ["Split"], locale: "en" };

let test: TestDatabase;

const fee = (
  listingId: string,
  listingOfferId: string,
  externalId: string,
  fields: Partial<typeof providerExtraCatalogue.$inferInsert>,
) => ({
  listingId,
  listingOfferId,
  source: "booking_manager",
  kind: "service" as const,
  externalId,
  name: externalId,
  obligatory: true,
  priceMinor: 0,
  priceCurrency: "EUR",
  priceMeasure: "per_booking",
  externalBaseId: HOME,
  ...fields,
});

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);

  const free = { from: FROM, to: shiftIso(FROM, 28) };
  const rules = [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }];
  const routed = await seedListing(db, "routed", {
    providerId: "prov_bm",
    free,
    rules,
    weeklyRateMinor: WEEKLY_RATE,
  });
  const skippered = await seedListing(db, "skippered", { providerId: "prov_bm", free, rules });
  const elsewhere = await seedListing(db, "elsewhere", { providerId: "prov_bm", free, rules });

  await db.insert(providerExtraCatalogue).values([
    fee(routed.listingId, routed.offerId, "APA", {
      priceMinor: 20_000,
      validRoutes: [`${HOME}>${HOME}`, `${OTHER}>${OTHER}`],
    }),
    fee(routed.listingId, routed.offerId, "One Way Fee", {
      priceMinor: 30_000,
      oneWayOnly: true,
      validRoutes: [`${HOME}>${OTHER}`],
    }),
    fee(routed.listingId, routed.offerId, "Charter pack Tenerife", {
      priceMinor: 50_000,
      validRoutes: [`${OTHER}>${OTHER}`],
    }),
    fee(routed.listingId, routed.offerId, "Sold at the other base", {
      priceMinor: 40_000,
      validForBaseIds: [OTHER],
    }),
    fee(skippered.listingId, skippered.offerId, "Skipper", {
      crewRole: "skipper",
      priceMinor: 150_000,
      priceMeasure: "per_week",
      validRoutes: [`${HOME}>${HOME}`],
    }),
    fee(elsewhere.listingId, elsewhere.offerId, "Skipper", {
      crewRole: "skipper",
      priceMinor: 150_000,
      priceMeasure: "per_week",
      validRoutes: [`${OTHER}>${OTHER}`],
    }),
  ]);

  await rebuildListingSearchDocs(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

const bySlug = async () => {
  const { items } = await searchListings(test.db, search);
  return new Map(items.map((item) => [item.slug, item]));
};

describe("route and base conditions on a fee", () => {
  it("counts a fee restricted to a return from home on the card, and nothing charged elsewhere", async () => {
    const routed = (await bySlug()).get("routed");

    expect(routed?.priceFromMinor).toBe(WEEKLY_RATE + 20_000);
  });

  it("makes a hull skippered only where the skipper is billed on a return from home", async () => {
    const cards = await bySlug();

    expect(cards.get("skippered")?.crewType).toBe("skipper");
    expect(cards.get("elsewhere")?.crewType).toBe("bareboat");
  });

  it("lists the fees a charter from home can be asked for, one-way ones labelled", async () => {
    const detail = await getListingDetailByIdOrSlug(test.db, "routed");

    expect(
      detail?.mandatoryExtras.map((item) => ({ label: item.label, oneWayOnly: item.oneWayOnly })),
    ).toEqual([
      { label: "APA", oneWayOnly: false },
      { label: "One Way Fee", oneWayOnly: true },
    ]);
  });
});
