import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { availabilitySlot, listingOffer, listingSource, providerRecord } from "../schema";
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

/*
 * A yacht whose operator confirms each booking by hand is still for sale, just not online. It is
 * listed with its dates and vendor price and marked, and where another vendor sells the same hull
 * online, that vendor's offer is the one the card describes.
 */

const SAT = isoDay(saturdayAhead());
const NEXT_SAT = shiftIso(SAT, 7);
const saturdayWeeks = [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }];

let test: TestDatabase;

async function pricedWeek(
  db: TestDatabase["db"],
  listingId: string,
  offerId: string,
  price: number,
) {
  await db.insert(availabilitySlot).values({
    listingId,
    listingOfferId: offerId,
    startDate: SAT,
    endDate: NEXT_SAT,
    status: "available",
    priceMinor: price,
    obligatoryExtrasMinor: 0,
    currency: "EUR",
  });
}

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);

  const vetted = await seedListing(db, "vetted", {
    free: { from: SAT, to: shiftIso(SAT, 21) },
    rules: saturdayWeeks,
  });
  await db
    .update(listingOffer)
    .set({ optionApprovalRequired: true })
    .where(eq(listingOffer.id, vetted.offerId));
  await pricedWeek(db, vetted.listingId, vetted.offerId, 300_000);

  /* One hull, two vendors: NauSYS confirms by hand and is cheaper, Booking Manager books online. */
  const shared = await seedListing(db, "shared", {
    free: { from: SAT, to: shiftIso(SAT, 21) },
    rules: saturdayWeeks,
  });
  await db
    .update(listingOffer)
    .set({ fixedBookingSupported: false })
    .where(eq(listingOffer.id, shared.offerId));
  await pricedWeek(db, shared.listingId, shared.offerId, 200_000);

  await db.insert(providerRecord).values({
    id: "prec_shared_bm",
    providerId: "prov_bm",
    resourceType: "yacht",
    externalId: "shared-bm",
  });
  await db.insert(listingSource).values({
    id: "lsrc_shared_bm",
    listingId: shared.listingId,
    providerRecordId: "prec_shared_bm",
    externalYachtId: "shared-bm",
  });
  await db.insert(listingOffer).values({
    id: "off_shared_bm",
    listingId: shared.listingId,
    listingSourceId: "lsrc_shared_bm",
    providerId: "prov_bm",
    operatorId: "op_test",
    homeBaseId: "base_test",
    crewType: "bareboat",
    defaultCurrency: "EUR",
  });
  await pricedWeek(db, shared.listingId, "off_shared_bm", 260_000);

  await rebuildListingSearchDocs(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

const card = async (slug: string) =>
  (await searchListings(test.db, { locale: "en", priceBasis: "base" })).items.find(
    (item) => item.slug === slug,
  );

describe("a yacht whose operator confirms each booking", () => {
  it("is listed with its dates and vendor price, and marked", async () => {
    expect(await card("vetted")).toMatchObject({
      bookableFrom: SAT,
      basePriceFromMinor: 300_000,
      requiresOperatorConfirmation: true,
    });
  });

  it("gives way to a vendor selling the same hull online, even a dearer one", async () => {
    expect(await card("shared")).toMatchObject({
      bestOfferId: "off_shared_bm",
      basePriceFromMinor: 260_000,
      requiresOperatorConfirmation: false,
    });
  });
});
