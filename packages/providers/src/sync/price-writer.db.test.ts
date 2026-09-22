import { listingPricePeriod } from "@yacht-charter/db/schema/availability";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { seedListing, seedSearchWorld } from "@yacht-charter/db/test-support/search-fixture";
import { asc, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDrizzlePricePeriodStore, writeSeasonalPrices } from "./price-writer";

/*
 * Three Booking Manager listings priced for the same four Saturday weeks, the first of them
 * already over. `repriced` is still priced for the second week only, `dropped` for none, and
 * `untouched` is not part of the run at all.
 */

const WEEKS = ["2026-09-12", "2026-09-26", "2026-10-03", "2026-10-10"] as const;
const weekEnd = (start: string) =>
  new Date(Date.parse(`${start}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);

let test: TestDatabase;

beforeAll(async () => {
  test = await createTestDatabase();
  const { db } = test;
  await seedSearchWorld(db);
  for (const slug of ["repriced", "dropped", "untouched"]) {
    await seedListing(db, slug, {
      providerId: "prov_bm",
      free: { from: WEEKS[0], to: weekEnd(WEEKS[3]) },
      rates: WEEKS.map((start) => ({ from: start, to: weekEnd(start), priceMinor: 400_000 })),
    });
  }
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

async function ratesOf(listingIds: string[]) {
  const rows = await test.db
    .select({
      listingId: listingPricePeriod.listingId,
      startDate: listingPricePeriod.startDate,
      priceMinor: listingPricePeriod.priceMinor,
    })
    .from(listingPricePeriod)
    .where(inArray(listingPricePeriod.listingId, listingIds))
    .orderBy(asc(listingPricePeriod.listingId), asc(listingPricePeriod.startDate));
  return rows.map((row) => `${row.listingId} ${row.startDate} ${row.priceMinor}`);
}

describe("writeSeasonalPrices inside a complete window", () => {
  it("deletes the weeks the fresh list no longer prices and nothing else", async () => {
    const written = await writeSeasonalPrices({
      store: createDrizzlePricePeriodStore({ db: test.db, providerId: "prov_bm" }),
      listingIds: ["lst_repriced", "lst_dropped"],
      loadSeasonalPrices: () =>
        Promise.resolve(
          new Map([
            [
              "lst_repriced",
              [
                {
                  startDate: WEEKS[1],
                  endDate: weekEnd(WEEKS[1]),
                  priceMinor: 450_000,
                  currency: "EUR",
                },
              ],
            ],
          ]),
        ),
      completeWithin: { start: "2026-09-22", end: WEEKS[3] },
    });

    expect(written).toBe(1);
    expect(await ratesOf(["lst_repriced", "lst_dropped", "lst_untouched"])).toEqual([
      "lst_dropped 2026-09-12 400000",
      "lst_dropped 2026-10-10 400000",
      "lst_repriced 2026-09-12 400000",
      "lst_repriced 2026-09-26 450000",
      "lst_repriced 2026-10-10 400000",
      "lst_untouched 2026-09-12 400000",
      "lst_untouched 2026-09-26 400000",
      "lst_untouched 2026-10-03 400000",
      "lst_untouched 2026-10-10 400000",
    ]);
  });

  it("keeps every rate when the loader does not vouch for its answer", async () => {
    await writeSeasonalPrices({
      store: createDrizzlePricePeriodStore({ db: test.db, providerId: "prov_bm" }),
      listingIds: ["lst_untouched"],
      loadSeasonalPrices: () => Promise.resolve(new Map()),
    });

    expect(await ratesOf(["lst_untouched"])).toHaveLength(4);
  });
});
