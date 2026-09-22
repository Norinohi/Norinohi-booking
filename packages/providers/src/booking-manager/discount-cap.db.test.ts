import { providerRawPayload, providerRecord } from "@yacht-charter/db/schema/provider";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import {
  isoDay,
  saturdayAhead,
  seedListing,
  seedSearchWorld,
  shiftIso,
} from "@yacht-charter/db/test-support/search-fixture";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadBookingManagerDiscountCap } from "./discount-cap";

/*
 * `stated` carries the yacht's own bound, as all 29 on company 225 do; `inherited` has lost it
 * from its payload and falls back to its company's; `unbound` belongs to a company stating none.
 */

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);
  const from = isoDay(saturdayAhead());
  const free = { from, to: shiftIso(from, 28) };

  await db.insert(providerRawPayload).values([
    {
      id: "praw_225",
      providerId: "prov_bm",
      payload: { id: 225, maxDiscountFromCommissionPercentage: 10.0 },
    },
    { id: "praw_silent", providerId: "prov_bm", payload: { id: 7 } },
    {
      id: "praw_stated",
      providerId: "prov_bm",
      payload: { id: 1, companyId: 225, maxDiscountFromCommissionPercentage: 0 },
    },
    { id: "praw_inherited", providerId: "prov_bm", payload: { id: 2, companyId: 225 } },
    { id: "praw_unbound", providerId: "prov_bm", payload: { id: 3, companyId: 7 } },
  ]);
  await db.insert(providerRecord).values([
    {
      providerId: "prov_bm",
      resourceType: "company",
      externalId: "225",
      rawPayloadId: "praw_225",
    },
    {
      providerId: "prov_bm",
      resourceType: "company",
      externalId: "7",
      rawPayloadId: "praw_silent",
    },
  ]);
  for (const slug of ["stated", "inherited", "unbound"]) {
    await seedListing(db, slug, { providerId: "prov_bm", free });
    await db
      .update(providerRecord)
      .set({ rawPayloadId: `praw_${slug}` })
      .where(eq(providerRecord.id, `prec_${slug}`));
  }
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("loadBookingManagerDiscountCap", () => {
  it("reads the yacht's own bound, zero included", async () => {
    await expect(loadBookingManagerDiscountCap(test.db, "lst_stated")).resolves.toBe(0);
  });

  it("falls back to the company's bound", async () => {
    await expect(loadBookingManagerDiscountCap(test.db, "lst_inherited")).resolves.toBe(10);
  });

  it("answers nothing where neither states one", async () => {
    await expect(loadBookingManagerDiscountCap(test.db, "lst_unbound")).resolves.toBeUndefined();
    await expect(loadBookingManagerDiscountCap(test.db, "lst_missing")).resolves.toBeUndefined();
  });
});
