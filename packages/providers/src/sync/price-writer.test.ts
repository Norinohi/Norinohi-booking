import { describe, expect, it } from "vitest";

import type { InventoryProvider } from "../provider";

import {
  dedupePricePeriodRows,
  type OfferRef,
  supportsSeasonalPrices,
  writeSeasonalPrices,
  type PricePeriodRow,
  type PricePeriodStore,
  type PricePeriodWrite,
  type PriceWindow,
  type SeasonalPrice,
} from "./price-writer";

const price = (over: Partial<SeasonalPrice> = {}): SeasonalPrice => ({
  startDate: "2026-07-04",
  endDate: "2026-07-11",
  priceMinor: 500_000,
  currency: "EUR",
  ...over,
});

/** Stands in for the Drizzle store; the conflict behaviour is the SQL's business. */
function fakeStore(sourceIds: Record<string, string | null> = {}) {
  const batches: PricePeriodRow[][] = [];
  const prunes: {
    offerIds: string[];
    window: PriceWindow;
    kept: string[];
  }[] = [];

  const store: PricePeriodStore = {
    loadSourceIds(listingIds) {
      const found = new Map<string, OfferRef>();
      for (const listingId of listingIds) {
        const listingSourceId = sourceIds[listingId];
        if (listingSourceId) {
          found.set(listingId, { listingSourceId, listingOfferId: `loff_${listingSourceId}` });
        }
      }
      return Promise.resolve(found);
    },
    writePricePeriods(rows) {
      batches.push([...rows]);
      return Promise.resolve(rows.length);
    },
    prunePricePeriods(offers, window, kept) {
      prunes.push({
        offerIds: offers.map((offer) => offer.listingOfferId),
        window,
        kept: kept.map((row) => `${row.listingOfferId}|${row.startDate}`),
      });
      return Promise.resolve(0);
    },
  };

  return { store, batches, prunes };
}

describe("dedupePricePeriodRows", () => {
  const write = (listingId: string, prices: SeasonalPrice[]): PricePeriodWrite => ({
    listingId,
    listingSourceId: `src_${listingId}`,
    listingOfferId: `loff_${listingId}`,
    prices,
  });

  it("collapses a period a yacht was published twice for, last one winning", () => {
    const { rows } = dedupePricePeriodRows([
      write("a", [price({ priceMinor: 400_000 }), price({ priceMinor: 450_000 })]),
    ]);

    expect(rows).toEqual([expect.objectContaining({ listingId: "a", priceMinor: 450_000 })]);
  });

  /*
   * The regression batching could introduce: keyed on the period alone, the second
   * boat's price would vanish into the first boat's row.
   */
  it("keeps two yachts priced for the same week apart", () => {
    const { rows } = dedupePricePeriodRows([
      write("a", [price({ priceMinor: 400_000 })]),
      write("b", [price({ priceMinor: 900_000 })]),
    ]);

    expect(rows).toHaveLength(2);
  });

  it("carries each listing's own offer and the weekly kind", () => {
    expect(dedupePricePeriodRows([write("a", [price()])]).rows[0]).toMatchObject({
      listingSourceId: "src_a",
      listingOfferId: "loff_a",
      kind: "weekly",
    });
  });

  it("is empty for a batch with no prices in it", () => {
    expect(dedupePricePeriodRows([write("a", [])]).rows).toEqual([]);
  });
});

describe("writeSeasonalPrices", () => {
  it("stores the provider's rates as the periods it published them for", async () => {
    const prices = [
      { startDate: "2026-01-01", endDate: "2026-06-30", priceMinor: 390_000, currency: "EUR" },
      { startDate: "2026-07-01", endDate: "2026-12-31", priceMinor: 450_000, currency: "EUR" },
    ];
    const { store, batches } = fakeStore({ ylst_marlin: "lsrc_marlin" });

    const written = await writeSeasonalPrices({
      store,
      listingIds: ["ylst_marlin"],
      loadSeasonalPrices: () => Promise.resolve(new Map([["ylst_marlin", prices]])),
    });

    expect(written).toBe(2);
    expect(batches).toEqual([
      prices.map((rate) => ({
        listingId: "ylst_marlin",
        listingSourceId: "lsrc_marlin",
        listingOfferId: "loff_lsrc_marlin",
        kind: "weekly",
        ...rate,
      })),
    ]);
  });

  /* The whole point of moving this: one batched write for the fleet, not one per boat. */
  it("writes every repriced listing in a single batch", async () => {
    const { store, batches } = fakeStore({ a: "src_a", b: "src_b", c: "src_c" });

    await writeSeasonalPrices({
      store,
      listingIds: ["a", "b", "c"],
      loadSeasonalPrices: () =>
        Promise.resolve(
          new Map([
            ["a", [price()]],
            ["b", [price()]],
            ["c", [price()]],
          ]),
        ),
    });

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(3);
  });

  /*
   * Absent is not the same statement as "no longer priced". Emptying a listing the
   * vendor simply did not mention would drop a live price list on the strength of
   * silence, and the card quotes "from" off these rows.
   */
  it("leaves a listing the provider published no rates for alone", async () => {
    const { store, batches } = fakeStore({ a: "src_a", b: "src_b" });

    const written = await writeSeasonalPrices({
      store,
      listingIds: ["a", "b"],
      loadSeasonalPrices: () => Promise.resolve(new Map([["a", [price()]]])),
    });

    expect(written).toBe(1);
    expect(batches[0]?.map((batchWrite) => batchWrite.listingId)).toEqual(["a"]);
  });

  it("prunes nothing for a loader that does not vouch for its whole answer", async () => {
    const { store, prunes } = fakeStore({ a: "src_a", b: "src_b" });

    await writeSeasonalPrices({
      store,
      listingIds: ["a", "b"],
      loadSeasonalPrices: () => Promise.resolve(new Map([["a", [price()]]])),
    });

    expect(prunes).toEqual([]);
  });

  /*
   * Booking Manager's sweep asks every week for the whole scope, so there silence is the
   * statement: a week it no longer prices must stop opening the season.
   */
  it("prunes inside a complete window, a listing left with no rates included", async () => {
    const { store, batches, prunes } = fakeStore({ a: "src_a", b: "src_b" });
    const window = { start: "2026-09-22", end: "2028-01-01" };

    await writeSeasonalPrices({
      store,
      listingIds: ["a", "b", "orphan"],
      loadSeasonalPrices: () => Promise.resolve(new Map([["a", [price()]]])),
      completeWithin: window,
    });

    expect(prunes).toEqual([
      { offerIds: ["loff_src_a", "loff_src_b"], window, kept: ["loff_src_a|2026-07-04"] },
    ]);
    expect(batches).toHaveLength(1);
  });

  /* A week whose fresh rate the column refused is not restated, so its stale rate goes too. */
  it("keeps only the rows it wrote, so a rejected week is pruned", async () => {
    const { store, batches, prunes } = fakeStore({ a: "src_a" });
    const window = { start: "2026-06-01", end: "2028-01-01" };

    await writeSeasonalPrices({
      store,
      listingIds: ["a"],
      loadSeasonalPrices: () =>
        Promise.resolve(
          new Map([
            [
              "a",
              [
                price(),
                price({
                  startDate: "2026-07-11",
                  endDate: "2026-07-18",
                  priceMinor: 8_883_888_500,
                }),
              ],
            ],
          ]),
        ),
      completeWithin: window,
    });

    expect(batches[0]?.map((row) => row.startDate)).toEqual(["2026-07-04"]);
    expect(prunes).toEqual([{ offerIds: ["loff_src_a"], window, kept: ["loff_src_a|2026-07-04"] }]);
  });

  it("prunes nothing when the write before it fails", async () => {
    const { store, prunes } = fakeStore({ a: "src_a" });
    store.writePricePeriods = () => Promise.reject(new Error("write failed"));

    await expect(
      writeSeasonalPrices({
        store,
        listingIds: ["a"],
        loadSeasonalPrices: () => Promise.resolve(new Map([["a", [price()]]])),
        completeWithin: { start: "2026-09-22", end: "2028-01-01" },
      }),
    ).rejects.toThrow("write failed");
    expect(prunes).toEqual([]);
  });

  it("leaves a listing with no active offer unpriced rather than unattributed", async () => {
    // `listing_price_period.listing_offer_id` is NOT NULL, and a rate belonging to nobody is
    // a price no vendor could be asked to honour.
    const { store, batches } = fakeStore();

    const written = await writeSeasonalPrices({
      store,
      listingIds: ["orphan"],
      loadSeasonalPrices: () => Promise.resolve(new Map([["orphan", [price()]]])),
    });

    expect(written).toBe(0);
    expect(batches[0]).toEqual([]);
  });

  it("asks the provider once for a listing named twice", async () => {
    const asked: string[][] = [];
    const { store } = fakeStore({ a: "src_a" });

    await writeSeasonalPrices({
      store,
      listingIds: ["a", "a"],
      loadSeasonalPrices: (listingIds) => {
        asked.push(listingIds);
        return Promise.resolve(new Map([["a", [price()]]]));
      },
    });

    expect(asked).toEqual([["a"]]);
  });

  it("does not go near the provider for an empty catalogue run", async () => {
    let called = false;
    const { store } = fakeStore();

    const written = await writeSeasonalPrices({
      store,
      listingIds: [],
      loadSeasonalPrices: () => {
        called = true;
        return Promise.resolve(new Map());
      },
    });

    expect(written).toBe(0);
    expect(called).toBe(false);
  });
});

describe("supportsSeasonalPrices", () => {
  it("recognises a provider that publishes a price list", () => {
    expect(supportsSeasonalPrices({ loadSeasonalPrices: () => Promise.resolve(new Map()) })).toBe(
      true,
    );
  });

  it("rejects one that does not", () => {
    const mock: Partial<InventoryProvider> = { key: "mock" };
    expect(supportsSeasonalPrices(mock)).toBe(false);
  });
});

/*
 * A rate the column cannot hold used to reach Postgres and take the statement with
 * it: `value "8883888500" is out of range for type integer`, which failed a sweep
 * across 11285 listings on production. High-denomination currencies reach ten digits
 * honestly, so this is vendor data, not corruption.
 */
describe("dedupePricePeriodRows: rates too large for the column", () => {
  const rate = (priceMinor: number, currency = "IDR") => ({
    startDate: "2026-09-05",
    endDate: "2026-09-12",
    priceMinor,
    currency,
  });
  const over = rate;
  const price = () => rate(450_000, "EUR");
  const write = (listingId: string, prices: ReturnType<typeof rate>[]) => ({
    listingId,
    listingSourceId: `src_${listingId}`,
    listingOfferId: `loff_${listingId}`,
    prices,
  });

  it("drops a rate above the integer ceiling and keeps counting", () => {
    const result = dedupePricePeriodRows([write("a", [over(8_883_888_500)])]);

    expect(result.rows).toHaveLength(0);
    expect(result.rejected).toBe(1);
  });

  it("keeps the other listings in the same batch", () => {
    const result = dedupePricePeriodRows([
      write("a", [over(8_883_888_500)]),
      write("b", [price()]),
    ]);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.listingId).toBe("b");
    expect(result.rejected).toBe(1);
  });

  it("admits the largest value the column does hold", () => {
    const result = dedupePricePeriodRows([write("a", [over(2_147_483_647)])]);

    expect(result.rows).toHaveLength(1);
    expect(result.rejected).toBe(0);
  });
});
