import { providerRawPayload, providerRecord } from "@yacht-charter/db/schema/provider";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { seedSearchWorld } from "@yacht-charter/db/test-support/search-fixture";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadBookingManagerPriceTerms } from "./price-terms";

/*
 * `giulia` is company 225's yacht with a non-default Crewed product; `orion` is filed at a
 * 19-digit base, written as the literal the vendor sends so the test sees whether it survives;
 * `bare` has no products and no bounds; `retired` is an inactive record.
 */

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);

  await db.insert(providerRawPayload).values([
    {
      id: "praw_giulia",
      providerId: "prov_bm",
      payload: {
        id: "7078608780000100225",
        homeBaseId: 194,
        minimumCharterDuration: 7,
        maximumCharterDuration: 90,
        products: [
          { name: "Bareboat", isDefaultProduct: true, extras: [{ id: 1, name: "Skipper" }] },
          { name: "Crewed", isDefaultProduct: false, extras: [] },
        ],
      },
    },
    {
      id: "praw_orion",
      providerId: "prov_bm",
      payload: sql`'{"homeBaseId": 3308139130000100225, "minimumCharterDuration": 0, "maximumCharterDuration": 1, "products": [{"name": "Cabin", "isDefaultProduct": false}, {"name": "Bareboat", "isDefaultProduct": true}]}'::jsonb`,
    },
    { id: "praw_bare", providerId: "prov_bm", payload: { products: "none" } },
    {
      id: "praw_retired",
      providerId: "prov_bm",
      payload: { homeBaseId: 1, products: [{ name: "Bareboat", isDefaultProduct: true }] },
    },
  ]);
  await db.insert(providerRecord).values([
    {
      providerId: "prov_bm",
      resourceType: "yacht",
      externalId: "giulia",
      rawPayloadId: "praw_giulia",
    },
    {
      providerId: "prov_bm",
      resourceType: "yacht",
      externalId: "orion",
      rawPayloadId: "praw_orion",
    },
    { providerId: "prov_bm", resourceType: "yacht", externalId: "bare", rawPayloadId: "praw_bare" },
    {
      providerId: "prov_bm",
      resourceType: "yacht",
      externalId: "retired",
      rawPayloadId: "praw_retired",
      active: false,
    },
  ]);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("loadBookingManagerPriceTerms", () => {
  it("reads each stored yacht's default product, home base and bounds", async () => {
    const terms = await loadBookingManagerPriceTerms(test.db, [
      "giulia",
      "orion",
      "bare",
      "retired",
      "unknown",
    ]);

    expect(Object.fromEntries(terms)).toEqual({
      giulia: { product: "Bareboat", homeBaseId: "194", minNights: 7, maxNights: 90 },
      orion: { product: "Bareboat", homeBaseId: "3308139130000100225", maxNights: 1 },
      bare: {},
    });
  });

  it("asks nothing of the database for no yachts", async () => {
    expect(await loadBookingManagerPriceTerms(test.db, [])).toEqual(new Map());
  });
});
