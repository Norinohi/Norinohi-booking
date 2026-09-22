import { readFile } from "node:fs/promises";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { base, baseSource, listingOffer, listingSource } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import {
  isoDay,
  saturdayAhead,
  seedListing,
  seedSearchWorld,
  shiftIso,
} from "../test-support/search-fixture";

const MIGRATION = new URL("../migrations/0152_bind_provider_bases.sql", import.meta.url);

/*
 * The migration already ran on the empty database `createTestDatabase` built, so the suite writes
 * what the old writer left and runs the same SQL again over it. Booking Manager base 194 forked:
 * two of its boats stand on `base_test`, one on `base_fork`. NauSYS names a base 194 of its own,
 * whose one boat stands on the fork. Base 25 was bound before, to a row none of its boats uses.
 */
describe("0152 binds each provider base to the row its boats stand on", () => {
  let test: TestDatabase;

  const boundTo = async (providerId: string, externalId: string) => {
    const rows = await test.db
      .select({ baseId: baseSource.baseId })
      .from(baseSource)
      .where(and(eq(baseSource.providerId, providerId), eq(baseSource.externalId, externalId)));
    return rows.map((row) => row.baseId);
  };

  const moor = async (slug: string, externalBaseId: string, baseId: string) => {
    await test.db
      .update(listingSource)
      .set({ externalBaseId })
      .where(eq(listingSource.id, `lsrc_${slug}`));
    await test.db
      .update(listingOffer)
      .set({ homeBaseId: baseId })
      .where(eq(listingOffer.id, `off_${slug}`));
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    const { db } = test;
    await seedSearchWorld(db);
    await db.insert(base).values([
      { id: "base_fork", locationId: "loc_test", name: "Kastela / Marina Kastela" },
      { id: "base_stale", locationId: "loc_test", name: "Trogir" },
      { id: "base_trogir", locationId: "loc_test", name: "Trogir / ACI Marina Trogir" },
    ]);
    const from = isoDay(saturdayAhead());
    const free = { from, to: shiftIso(from, 28) };
    for (const slug of ["bm-a1", "bm-a2", "bm-b1", "bm-trogir"]) {
      await seedListing(db, slug, { providerId: "prov_bm", free });
    }
    await seedListing(db, "ns-b1", { providerId: "prov_ns", free });
    await moor("bm-a1", "194", "base_test");
    await moor("bm-b1", "194", "base_fork");
    await moor("bm-a2", "194", "base_test");
    await moor("ns-b1", "194", "base_fork");
    await moor("bm-trogir", "25", "base_trogir");
    await db
      .insert(baseSource)
      .values({ providerId: "prov_bm", externalId: "25", baseId: "base_stale" });

    await db.execute(sql.raw(await readFile(MIGRATION, "utf8")));
  }, 120_000);

  afterAll(async () => {
    await test?.drop();
  });

  it("binds a forked base to the row carrying more of its boats", async () => {
    expect(await boundTo("prov_bm", "194")).toEqual(["base_test"]);
  });

  it("binds another provider's base of the same id on its own", async () => {
    expect(await boundTo("prov_ns", "194")).toEqual(["base_fork"]);
  });

  it("leaves a binding already made alone", async () => {
    expect(await boundTo("prov_bm", "25")).toEqual(["base_stale"]);
  });

  it("is a no-op the second time", async () => {
    const before = await test.db.select().from(baseSource);
    await test.db.execute(sql.raw(await readFile(MIGRATION, "utf8")));
    expect(await test.db.select().from(baseSource)).toEqual(before);
  });
});
