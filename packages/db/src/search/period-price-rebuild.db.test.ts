import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { availabilitySlot } from "../schema";
import { createTestDatabase, type TestDatabase } from "../test-support/database";
import {
  isoDay,
  saturdayAhead,
  seedListing,
  seedSearchWorld,
  shiftIso,
} from "../test-support/search-fixture";
import { rebuildListingPeriodPrices } from "./period-prices";

/*
 * The rebuild is a diff, not a rewrite: the table is rebuilt for every listing a sync touches, so
 * what matters is that an unchanged charter is not written again. `xmin` is the evidence - a row
 * Postgres did not touch keeps the transaction id that last wrote it.
 */

const W1 = isoDay(saturdayAhead());
const W2 = shiftIso(W1, 7);
const W3 = shiftIso(W1, 14);
const W4 = shiftIso(W1, 21);
const W5 = shiftIso(W1, 28);

const saturdayWeeks = [{ checkinWeekday: 6, checkoutWeekday: 6, minNights: 7 }];

let test: TestDatabase;

type Row = { listingId: string; startDate: string; allInMinor: number; rowVersion: string };

async function periodPrices(): Promise<Row[]> {
  const { rows } = await test.db.execute<Row>(sql`
    select listing_id as "listingId", start_date::text as "startDate",
           all_in_minor as "allInMinor", xmin::text as "rowVersion"
    from listing_period_price
    order by listing_id, start_date
  `);
  return rows;
}

function keyed(rows: Row[]) {
  return new Map(rows.map((row) => [`${row.listingId}|${row.startDate}`, row]));
}

async function slotFor(listing: string, start: string, end: string, priceMinor: number) {
  await test.db.insert(availabilitySlot).values({
    listingId: `lst_${listing}`,
    listingOfferId: `off_${listing}`,
    startDate: start,
    endDate: end,
    status: "available",
    priceMinor,
    obligatoryExtrasMinor: 0,
    currency: "EUR",
  });
}

beforeAll(async () => {
  test = await createTestDatabase();
  await seedSearchWorld(test.db);
  for (const slug of ["delta", "echo"]) {
    await seedListing(test.db, slug, { free: { from: W1, to: W5 }, rules: saturdayWeeks });
  }
  await slotFor("delta", W1, W2, 500_000);
  await slotFor("delta", W2, W3, 520_000);
  await slotFor("echo", W1, W2, 600_000);
  await rebuildListingPeriodPrices(test.db, undefined);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("rebuildListingPeriodPrices", () => {
  it("holds a row per priced charter", async () => {
    expect((await periodPrices()).map((row) => `${row.listingId}|${row.startDate}`)).toEqual([
      `lst_delta|${W1}`,
      `lst_delta|${W2}`,
      `lst_echo|${W1}`,
    ]);
  });

  it("writes nothing when no price changed", async () => {
    const before = await periodPrices();
    await rebuildListingPeriodPrices(test.db, undefined);
    expect(await periodPrices()).toEqual(before);
  });

  it("rewrites only the charter whose price changed", async () => {
    const before = keyed(await periodPrices());
    await test.db
      .update(availabilitySlot)
      .set({ priceMinor: 555_000 })
      .where(
        and(eq(availabilitySlot.listingOfferId, "off_delta"), eq(availabilitySlot.startDate, W1)),
      );
    await rebuildListingPeriodPrices(test.db, undefined);

    const after = keyed(await periodPrices());
    const changed = after.get(`lst_delta|${W1}`);
    expect(changed?.allInMinor).toBe(555_000);
    expect(changed?.rowVersion).not.toBe(before.get(`lst_delta|${W1}`)?.rowVersion);
    for (const key of [`lst_delta|${W2}`, `lst_echo|${W1}`]) {
      expect(after.get(key)).toEqual(before.get(key));
    }
  });

  it("inserts a newly priced charter and leaves the rest alone", async () => {
    const before = keyed(await periodPrices());
    await slotFor("echo", W3, W4, 610_000);
    await rebuildListingPeriodPrices(test.db, undefined);

    const after = keyed(await periodPrices());
    expect(after.get(`lst_echo|${W3}`)?.allInMinor).toBe(610_000);
    for (const [key, row] of before) expect(after.get(key)).toEqual(row);
  });

  it("deletes a charter the vendor no longer prices", async () => {
    const before = keyed(await periodPrices());
    await test.db
      .delete(availabilitySlot)
      .where(
        and(eq(availabilitySlot.listingOfferId, "off_echo"), eq(availabilitySlot.startDate, W3)),
      );
    await rebuildListingPeriodPrices(test.db, undefined);

    const after = keyed(await periodPrices());
    expect(after.has(`lst_echo|${W3}`)).toBe(false);
    for (const [key, row] of before) {
      if (key !== `lst_echo|${W3}`) expect(after.get(key)).toEqual(row);
    }
  });

  it("leaves listings outside the scope untouched", async () => {
    const before = keyed(await periodPrices());
    await slotFor("delta", W3, W4, 530_000);
    await test.db
      .delete(availabilitySlot)
      .where(
        and(eq(availabilitySlot.listingOfferId, "off_echo"), eq(availabilitySlot.startDate, W1)),
      );

    await rebuildListingPeriodPrices(test.db, ["lst_delta"]);
    const scoped = keyed(await periodPrices());
    expect(scoped.get(`lst_delta|${W3}`)?.allInMinor).toBe(530_000);
    expect(scoped.get(`lst_echo|${W1}`)).toEqual(before.get(`lst_echo|${W1}`));

    await rebuildListingPeriodPrices(test.db, undefined);
    const full = keyed(await periodPrices());
    expect(full.has(`lst_echo|${W1}`)).toBe(false);
    expect(full.get(`lst_delta|${W3}`)).toEqual(scoped.get(`lst_delta|${W3}`));
  });
});
