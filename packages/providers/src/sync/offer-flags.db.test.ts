import { listingOffer } from "@yacht-charter/db/schema/listing-offer";
import { providerExtraCatalogue } from "@yacht-charter/db/schema/listing-source";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import {
  isoDay,
  saturdayAhead,
  seedListing,
  seedSearchWorld,
  shiftIso,
} from "@yacht-charter/db/test-support/search-fixture";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deriveOfferFlagsFromExtras } from "./offer-flags";

/*
 * Booking Manager flags the extra that waives the deposit (`includesDepositWaiver`) rather than
 * naming it any particular way: company 225's operators call theirs whatever they like.
 */

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);

  const from = isoDay(saturdayAhead());
  const free = { from, to: shiftIso(from, 28) };
  const flagged = await seedListing(db, "flagged", { providerId: "prov_bm", free });
  const optional = await seedListing(db, "optional", { providerId: "prov_bm", free });
  const percent = await seedListing(db, "percent", { providerId: "prov_bm", free });
  const free0 = await seedListing(db, "free", { providerId: "prov_bm", free });

  const cover = { source: "booking_manager", kind: "service" as const, name: "Comfort Plus" };
  await db.insert(providerExtraCatalogue).values([
    {
      ...cover,
      listingId: flagged.listingId,
      listingOfferId: flagged.offerId,
      externalId: "1",
      obligatory: true,
      priceMinor: 20_000,
      depositInsurance: true,
    },
    {
      ...cover,
      listingId: optional.listingId,
      listingOfferId: optional.offerId,
      externalId: "2",
      obligatory: false,
      priceMinor: 20_000,
      depositInsurance: true,
    },
    /* How the projection files a BM "Damage waiver 6": 6% of the charter, price left at 0. */
    {
      ...cover,
      name: "Damage waiver 6",
      listingId: percent.listingId,
      listingOfferId: percent.offerId,
      externalId: "3",
      obligatory: false,
      priceMinor: 0,
      percentage: "0.0600",
      depositInsurance: true,
    },
    {
      ...cover,
      listingId: free0.listingId,
      listingOfferId: free0.offerId,
      externalId: "4",
      obligatory: false,
      priceMinor: 0,
      depositInsurance: true,
    },
  ]);

  await deriveOfferFlagsFromExtras(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("deposit cover the vendor flags", () => {
  it("counts an obligatory or free waiver as included, and a percentage one as not", async () => {
    const rows = await test.db
      .select({ id: listingOffer.id, included: listingOffer.depositInsuranceIncluded })
      .from(listingOffer);

    expect(Object.fromEntries(rows.map((row) => [row.id, row.included]))).toEqual({
      off_flagged: true,
      off_optional: false,
      off_percent: false,
      off_free: true,
    });
  });
});
