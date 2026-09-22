import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { base } from "../schema";
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

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);
  const from = isoDay(saturdayAhead());
  await seedListing(db, "addressed", {
    providerId: "prov_bm",
    free: { from, to: shiftIso(from, 28) },
  });
  await rebuildListingSearchDocs(db);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("the marina's address on the detail page", () => {
  const addressOf = async () =>
    (await getListingDetailByIdOrSlug(test.db, "addressed"))?.importantInformation.marinaContact
      .address;

  it("names the place alone where the operator states no street", async () => {
    expect(await addressOf()).toBe("Marina Kastela, Kastela, Croatia");
  });

  it("puts the operator's own address line between the marina and its town", async () => {
    await test.db.update(base).set({ address: "Uvala Baluni 8" }).where(eq(base.id, "base_test"));
    expect(await addressOf()).toBe("Marina Kastela, Uvala Baluni 8, Kastela, Croatia");
  });
});
