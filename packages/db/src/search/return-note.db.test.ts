import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listingOffer, listingSource, listingText, operator, providerRecord } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import {
  isoDay,
  saturdayAhead,
  seedListing,
  seedSearchWorld,
  shiftIso,
} from "../test-support/search-fixture";
import { readReturnNote } from "./return-note";

/*
 * `listed` sells through the world's operator and carries a NauSYS-style return text of its own;
 * `fleet` is sold by a Booking Manager operator whose rule is stated once for its whole fleet.
 * `merged` is sold by both: NauSYS's offer carries a base text, Booking Manager's none.
 */

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);
  const from = isoDay(saturdayAhead());
  const free = { from, to: shiftIso(from, 28) };
  await seedListing(db, "listed", { free });
  await seedListing(db, "fleet", { providerId: "prov_bm", free });

  await db.insert(operator).values({
    id: "op_bm",
    name: "Fleet Charter",
    slug: "booking_manager-fleet-charter-1",
    checkoutNote: "Return on Friday by 18:00.",
  });
  await db
    .update(listingOffer)
    .set({ operatorId: "op_bm" })
    .where(eq(listingOffer.id, "off_fleet"));
  await db.update(operator).set({ checkoutNote: " " }).where(eq(operator.id, "op_test"));
  await seedListing(db, "merged", { free });
  await db.insert(providerRecord).values({
    id: "prec_merged_bm",
    providerId: "prov_bm",
    resourceType: "yacht",
    externalId: "merged-bm",
  });
  await db.insert(listingSource).values({
    id: "lsrc_merged_bm",
    listingId: "lst_merged",
    providerRecordId: "prec_merged_bm",
    externalYachtId: "merged-bm",
  });
  await db.insert(listingOffer).values({
    id: "off_merged_bm",
    listingId: "lst_merged",
    listingSourceId: "lsrc_merged_bm",
    providerId: "prov_bm",
    operatorId: "op_bm",
    homeBaseId: "base_test",
    crewType: "bareboat",
    defaultCurrency: "EUR",
  });
  await db.insert(listingText).values([
    {
      listingId: "lst_merged",
      listingOfferId: "off_merged",
      kind: "return_note",
      locale: "en",
      value: "Back at the NauSYS base by 08:00.",
    },
    {
      listingId: "lst_listed",
      listingOfferId: "off_listed",
      kind: "return_note",
      locale: "en",
      value: "Back by 08:00.",
    },
    {
      listingId: "lst_listed",
      listingOfferId: "off_listed",
      kind: "return_note",
      locale: "de",
      value: "Zurück bis 08:00.",
    },
  ]);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("the rule for bringing the boat back", () => {
  const noteOf = (listingId: string, listingOfferId: string | null, locale = "en") =>
    readReturnNote(test.db, { listingId, listingOfferId, locale });

  it("reads the listing's own text in the reader's language, else in English", async () => {
    expect(await noteOf("lst_listed", "off_listed", "de")).toBe("Zurück bis 08:00.");
    expect(await noteOf("lst_listed", "off_listed", "fr")).toBe("Back by 08:00.");
  });

  it("falls back to the rule the selling operator states for its whole fleet", async () => {
    expect(await noteOf("lst_fleet", "off_fleet")).toBe("Return on Friday by 18:00.");
  });

  it("says nothing where the operator's note is blank or no offer names that operator", async () => {
    expect(await noteOf("lst_fleet", null)).toBeUndefined();
  });

  it("reads a merged listing's rule off the offer being sold, never another fleet's", async () => {
    expect(await noteOf("lst_merged", "off_merged_bm")).toBe("Return on Friday by 18:00.");
    expect(await noteOf("lst_merged", "off_merged")).toBe("Back at the NauSYS base by 08:00.");
    expect(await noteOf("lst_merged", null)).toBe("Back at the NauSYS base by 08:00.");
  });
});
