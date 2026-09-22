import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import type { CatalogueResolver, ExternalListingRef } from "../shared/catalogue-resolver";
import type { QueryValue } from "../shared/http-client";
import type { BookingManagerClient } from "./client";
import { type BookingManagerConfig, resolveBookingManagerConfig } from "./config";
import { parseExactJson } from "../shared/exact-json";
import { restPriceListSchema, restYachtSchema, type RestPrice } from "./endpoints";
import { type BookingManagerPriceTerms, priceTermsOf } from "./price-terms";
import {
  type BookingManagerPriceCandidate,
  charterSaturdays,
  createBookingManagerSeasonalPriceLoader,
  mapBookingManagerPriceCandidate,
  mapBookingManagerPriceRow,
  selectBookingManagerWeeklyPrices,
} from "./prices";

const noTerms = () => Promise.resolve(new Map<string, BookingManagerPriceTerms>());

const config: BookingManagerConfig = resolveBookingManagerConfig({
  BOOKING_MANAGER_BASE_URL: "https://www.booking-manager.com/api/v2",
  BOOKING_MANAGER_API_KEY: "t0ken",
  BOOKING_MANAGER_TIMEOUT_MS: 30_000,
  BOOKING_MANAGER_SYNC_TIMEOUT_MS: 180_000,
  BOOKING_MANAGER_MIN_INTERVAL_MS: 0,
  BOOKING_MANAGER_SWEEP_CONCURRENCY: 4,
  BOOKING_MANAGER_PRICE_WEEKS_CONCURRENCY: 4,
  BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES: 15,
  BOOKING_MANAGER_TIMEZONE: "Europe/Zagreb",
});

const row = (over: Partial<RestPrice> = {}): RestPrice => ({
  yachtId: "42",
  dateFrom: "2027-01-02 17:00:00",
  dateTo: "2027-01-09 09:00:00",
  price: 1234.5,
  currency: "EUR",
  ...over,
});

type PriceQuery = Record<string, QueryValue | undefined>;

/**
 * The loader only ever calls `get`, and only for the price list. Everything the
 * real client does around that call (auth, retries, parsing) is covered by
 * `client.test.ts`, so the stub answers the query directly.
 */
function fakeClient(get: (query: PriceQuery) => Promise<RestPrice[]>): BookingManagerClient {
  // SAFETY: a stub with nothing behind it; any method the loader does not use is
  // absent, so reaching for one is a TypeError rather than a wrong answer.
  return Object.assign({} as BookingManagerClient, {
    get: (_endpoint: string, _schema: z.ZodType<RestPrice[]>, query: PriceQuery = {}) => get(query),
    // The sweep spreads itself over lanes; the stub has no queue, so the name is
    // all that is asserted here and the real spacing is covered by queue.test.ts.
    sweepLane: (name: string, slot: number) => ({ queueKey: `${name}#${slot}` }),
  });
}

const listingRef: ExternalListingRef = {
  externalYachtId: "42",
  externalCompanyId: null,
  externalBaseId: null,
  listingSourceId: "lsrc_1",
};

function fakeResolver(
  toExternalYachtIds: CatalogueResolver["toExternalYachtIds"],
): CatalogueResolver {
  return {
    providerId: () => Promise.resolve("prv_booking_manager"),
    toExternalListing: () => Promise.reject(new Error("the price sweep must not ask per listing")),
    toExternalYachtIds,
    toListingId: () => Promise.resolve(null),
    toExternalCountryId: () => Promise.resolve(null),
    loadListingSummary: () => Promise.resolve(null),
    listExternalCompanyIds: () => Promise.resolve([]),
    listYachtCompanyScopeKeys: async () => [],
  };
}

describe("charterSaturdays", () => {
  it("returns every Saturday in the year", () => {
    const saturdays = charterSaturdays([2027]);

    // 2027-01-02 is the first Saturday of that year.
    expect(saturdays[0]).toBe("2027-01-02");
    expect(saturdays).toHaveLength(52);
    for (const day of saturdays) {
      expect(new Date(`${day}T00:00:00Z`).getUTCDay()).toBe(6);
    }
  });

  it("spans every requested year without a gap at the boundary", () => {
    const saturdays = charterSaturdays([2027, 2028]);
    const gaps = saturdays
      .slice(1)
      .map((day, i) => Date.parse(`${day}T00:00:00Z`) - Date.parse(`${saturdays[i]}T00:00:00Z`));

    expect(new Set(gaps)).toEqual(new Set([7 * 86_400_000]));
  });

  it("returns nothing for no years", () => {
    expect(charterSaturdays([])).toEqual([]);
  });
});

describe("mapBookingManagerPriceRow", () => {
  it("spans the week it priced, half-open on the check-out day", () => {
    // Every reader is half-open (`start <= day < end`), so the check-out Saturday is
    // excluded without collapsing the period - and collapsing it made the rate cover
    // no day at all, which read as a closed season on every Booking Manager listing.
    expect(mapBookingManagerPriceRow(row(), "2027-01-02", "2027-01-09")).toEqual({
      startDate: "2027-01-02",
      endDate: "2027-01-09",
      priceMinor: 123_450,
      currency: "EUR",
    });
  });

  it("covers its own check-in day and not the next week's", () => {
    const price = mapBookingManagerPriceRow(row(), "2027-01-02", "2027-01-09");
    const covers = (day: string) => price!.startDate <= day && day < price!.endDate;

    expect(covers("2027-01-02")).toBe(true);
    expect(covers("2027-01-08")).toBe(true);
    // The Saturday that begins the following charter belongs to the following rate.
    expect(covers("2027-01-09")).toBe(false);
  });

  it("drops a row the vendor answered for a different period", () => {
    expect(mapBookingManagerPriceRow(row(), "2027-01-09", "2027-01-16")).toBeNull();
  });

  it("falls back to the requested currency when the row omits one", () => {
    expect(
      mapBookingManagerPriceRow(row({ currency: null }), "2027-01-02", "2027-01-09", "EUR"),
    ).toMatchObject({
      currency: "EUR",
    });
  });

  it.each([null, undefined])("drops a row with price %o", (price) => {
    expect(mapBookingManagerPriceRow(row({ price }), "2027-01-02", "2027-01-09")).toBeNull();
  });

  it.each([0, -1])("drops a row priced at %o rather than advertising it", (price) => {
    // The card's "from" price is the minimum across periods, so one zero week would
    // price the whole boat at nothing. Observed live: the vendor sends 0 for the
    // year-end week on every yacht in the test fleet.
    expect(mapBookingManagerPriceRow(row({ price }), "2027-01-02", "2027-01-09")).toBeNull();
  });

  it("drops a row with no usable currency", () => {
    expect(
      mapBookingManagerPriceRow(row({ currency: null }), "2027-01-02", "2027-01-09"),
    ).toBeNull();
  });
});

describe("createBookingManagerSeasonalPriceLoader", () => {
  function harness(rows: RestPrice[]) {
    const calls: PriceQuery[] = [];
    const client = fakeClient((query) => {
      calls.push(query);
      const checkIn = String(query.dateFrom).slice(0, 10);
      return Promise.resolve(rows.filter((r) => String(r.dateFrom).startsWith(checkIn)));
    });

    // Every listing maps to the one fixture yacht, except the unlinked one, which the
    // resolver leaves out of the map entirely - there is no id to give.
    const resolverCalls: (readonly string[])[] = [];
    const resolver = fakeResolver((listingIds) => {
      resolverCalls.push([...listingIds]);
      return Promise.resolve(
        new Map(
          listingIds
            .filter((listingId) => listingId !== "ylst_unlinked")
            .map((listingId) => [listingId, listingRef.externalYachtId]),
        ),
      );
    });

    return { calls, client, resolver, resolverCalls };
  }

  /*
   * The mapping used to be one `toExternalListing` per listing, so a fleet-wide
   * sweep was a round-trip per boat to answer one question about a set.
   */
  it("asks for the whole batch's yacht ids in one call", async () => {
    const { client, resolver, resolverCalls } = harness([row()]);
    const load = createBookingManagerSeasonalPriceLoader({
      client,
      resolver,
      config,
      years: [2027],
      loadPriceTerms: noTerms,
    });

    await load(["ylst_a", "ylst_b", "ylst_c", "ylst_a"]);

    expect(resolverCalls).toHaveLength(1);
    expect(resolverCalls[0]).toEqual(["ylst_a", "ylst_b", "ylst_c", "ylst_a"]);
  });

  it("sweeps a week at a time for the whole fleet, never per yacht", async () => {
    const { calls, client, resolver } = harness([row()]);
    const load = createBookingManagerSeasonalPriceLoader({
      client,
      resolver,
      config,
      years: [2027],
      loadPriceTerms: noTerms,
    });

    await load(["ylst_a"]);

    expect(calls).toHaveLength(52);
    // The vendor returns every boat when yachtId is omitted, which is one call
    // per week instead of one per batch of boats.
    expect(calls.every((q) => q.yachtId === undefined)).toBe(true);
    expect(calls[0]).toMatchObject({
      dateFrom: "2027-01-02T00:00:00",
      dateTo: "2027-01-09T00:00:00",
    });
  });

  it("keys results back to the internal listing id", async () => {
    const { client, resolver } = harness([row()]);
    const load = createBookingManagerSeasonalPriceLoader({
      client,
      resolver,
      config,
      years: [2027],
      loadPriceTerms: noTerms,
    });

    expect(await load(["ylst_a"])).toEqual(
      new Map([
        [
          "ylst_a",
          [
            {
              startDate: "2027-01-02",
              endDate: "2027-01-09",
              priceMinor: 123_450,
              currency: "EUR",
            },
          ],
        ],
      ]),
    );
  });

  it("sweeps once across repeated scope calls", async () => {
    const { calls, client, resolver } = harness([row()]);
    const load = createBookingManagerSeasonalPriceLoader({
      client,
      resolver,
      config,
      years: [2027],
      loadPriceTerms: noTerms,
    });

    await load(["ylst_a"]);
    await load(["ylst_b"]);

    expect(calls).toHaveLength(52);
  });

  it("never calls the vendor for an empty request", async () => {
    const { calls, client, resolver } = harness([row()]);
    const load = createBookingManagerSeasonalPriceLoader({
      client,
      resolver,
      config,
      years: [2027],
      loadPriceTerms: noTerms,
    });

    expect(await load([])).toEqual(new Map());
    expect(calls).toHaveLength(0);
  });

  it("skips a listing with no Booking Manager source rather than failing", async () => {
    const { client, resolver } = harness([row()]);
    const load = createBookingManagerSeasonalPriceLoader({
      client,
      resolver,
      config,
      years: [2027],
      loadPriceTerms: noTerms,
    });

    expect(await load(["ylst_unlinked"])).toEqual(new Map());
  });

  it("retries the sweep after a failure instead of caching an empty fleet", async () => {
    let attempts = 0;
    const client = fakeClient(() => {
      attempts += 1;
      return attempts <= 1 ? Promise.reject(new Error("boom")) : Promise.resolve([]);
    });
    const resolver = fakeResolver(() =>
      Promise.resolve(new Map([["ylst_a", listingRef.externalYachtId]])),
    );

    const load = createBookingManagerSeasonalPriceLoader({
      client,
      resolver,
      config,
      years: [2027],
      loadPriceTerms: noTerms,
    });

    await expect(load(["ylst_a"])).rejects.toThrow("boom");
    await expect(load(["ylst_a"])).resolves.toEqual(new Map());
  });
});

/*
 * Two weeks of company 225's price list as the vendor sent them, with the four yacht fields the
 * selection reads. Every yacht there has one round trip at its home base; SS 123, Orion, Tri Luke
 * and Iraz are also listed for one-way pairs `/offers` refused, and Giulia's non-default Crewed
 * product came back at 0.0 on 26.12.2026.
 */
const fixture = z
  .object({
    yachts: z.array(
      restYachtSchema.pick({
        id: true,
        name: true,
        products: true,
        homeBaseId: true,
        minimumCharterDuration: true,
        maximumCharterDuration: true,
      }),
    ),
    prices: z.record(z.string(), restPriceListSchema),
  })
  .parse(
    parseExactJson(readFileSync(new URL("fixtures/prices-225.json", import.meta.url), "utf8")),
  );

const yachtIdOf = (name: string) => {
  const yacht = fixture.yachts.find((item) => item.name === name);
  if (!yacht) throw new Error(`no ${name} in the 225 fixture`);
  return yacht.id;
};

const termsOf = (yachtId: string) => {
  const yacht = fixture.yachts.find((item) => item.id === yachtId);
  return yacht ? priceTermsOf(yacht) : undefined;
};

function candidatesOf(yachtId: string, week: string): BookingManagerPriceCandidate[] {
  const checkOut = new Date(Date.parse(`${week}T00:00:00Z`) + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return (fixture.prices[week] ?? [])
    .filter((item) => item.yachtId === yachtId)
    .flatMap((item) => mapBookingManagerPriceCandidate(item, week, checkOut) ?? []);
}

const candidate = (over: {
  priceMinor: number;
  product?: string | null;
  startBaseId?: string | null;
  endBaseId?: string | null;
  startDate?: string;
}): BookingManagerPriceCandidate => {
  const startDate = over.startDate ?? "2027-06-05";
  return {
    price: {
      startDate,
      endDate: new Date(Date.parse(`${startDate}T00:00:00Z`) + 7 * 86_400_000)
        .toISOString()
        .slice(0, 10),
      priceMinor: over.priceMinor,
      currency: "EUR",
    },
    product: over.product === undefined ? "Bareboat" : over.product,
    startBaseId: over.startBaseId === undefined ? "194" : over.startBaseId,
    endBaseId: over.endBaseId === undefined ? "194" : over.endBaseId,
  };
};

describe("priceTermsOf", () => {
  it("reads the default product, home base and bounds off a 225 yacht", () => {
    expect(termsOf(yachtIdOf("Giulia"))).toEqual({
      product: "Bareboat",
      homeBaseId: "194",
      minNights: 7,
      maxNights: 90,
    });
    // West Wind lists Cabin first and flags Bareboat as the default, and states no minimum.
    expect(termsOf(yachtIdOf("West Wind"))).toEqual({
      product: "Bareboat",
      homeBaseId: "194",
      maxNights: 90,
    });
  });
});

describe("selectBookingManagerWeeklyPrices", () => {
  it("prices every 225 yacht once a week, at its home base round trip", () => {
    for (const week of ["2026-12-26", "2027-06-05"]) {
      const yachtIds = new Set((fixture.prices[week] ?? []).map((item) => item.yachtId));
      for (const yachtId of yachtIds) {
        const prices = selectBookingManagerWeeklyPrices(
          candidatesOf(yachtId, week),
          termsOf(yachtId),
        );
        expect(prices.map((item) => item.startDate)).toEqual([week]);
      }
    }
  });

  it("takes Giulia's Bareboat week and not the Crewed row beside it", () => {
    const giulia = yachtIdOf("Giulia");
    expect(
      selectBookingManagerWeeklyPrices(candidatesOf(giulia, "2026-12-26"), termsOf(giulia)),
    ).toEqual([
      { startDate: "2026-12-26", endDate: "2027-01-02", priceMinor: 288_100, currency: "EUR" },
    ]);
  });

  it("never lets another product's dearer week stand in for the default one", () => {
    const prices = selectBookingManagerWeeklyPrices(
      [
        candidate({ priceMinor: 288_100, product: "Bareboat" }),
        candidate({ priceMinor: 640_000, product: "Crewed" }),
      ],
      { product: "bareboat", homeBaseId: "194" },
    );
    expect(prices.map((item) => item.priceMinor)).toEqual([288_100]);
  });

  it("leaves a week unpriced where only another product has a rate", () => {
    expect(
      selectBookingManagerWeeklyPrices([candidate({ priceMinor: 640_000, product: "Crewed" })], {
        product: "Bareboat",
      }),
    ).toEqual([]);
  });

  it("prices a week without a stored record only where the rows agree on one product", () => {
    expect(
      selectBookingManagerWeeklyPrices(
        [
          candidate({ priceMinor: 288_100, product: "Bareboat" }),
          candidate({ priceMinor: 640_000, product: "Crewed" }),
        ],
        undefined,
      ),
    ).toEqual([]);
    expect(
      selectBookingManagerWeeklyPrices([candidate({ priceMinor: 288_100 })], undefined),
    ).toHaveLength(1);
  });

  it("prefers the home base round trip over another base's and never a one-way pair", () => {
    const prices = selectBookingManagerWeeklyPrices(
      [
        candidate({ priceMinor: 500_000, startBaseId: "25", endBaseId: "31" }),
        candidate({ priceMinor: 700_000, startBaseId: "25", endBaseId: "25" }),
        candidate({ priceMinor: 750_000, startBaseId: "31", endBaseId: "31" }),
      ],
      { product: "Bareboat", homeBaseId: "31" },
    );
    expect(prices.map((item) => item.priceMinor)).toEqual([750_000]);
  });

  it("falls back to another base's round trip, and leaves a one-way-only week unpriced", () => {
    expect(
      selectBookingManagerWeeklyPrices(
        [candidate({ priceMinor: 700_000, startBaseId: "25", endBaseId: "25" })],
        { product: "Bareboat", homeBaseId: "31" },
      ).map((item) => item.priceMinor),
    ).toEqual([700_000]);
    expect(
      selectBookingManagerWeeklyPrices(
        [candidate({ priceMinor: 500_000, startBaseId: "25", endBaseId: "31" })],
        { product: "Bareboat", homeBaseId: "25" },
      ),
    ).toEqual([]);
  });

  it("reads a row with no base pair as the round trip a pre-2.2.2 row always was", () => {
    expect(
      selectBookingManagerWeeklyPrices(
        [candidate({ priceMinor: 400_000, startBaseId: null, endBaseId: null })],
        { product: "Bareboat", homeBaseId: "31" },
      ),
    ).toHaveLength(1);
  });

  it("prices no week for a yacht whose bounds refuse seven nights", () => {
    const week = [candidate({ priceMinor: 400_000 })];
    expect(selectBookingManagerWeeklyPrices(week, { minNights: 14 })).toEqual([]);
    expect(selectBookingManagerWeeklyPrices(week, { maxNights: 1 })).toEqual([]);
    expect(selectBookingManagerWeeklyPrices(week, { minNights: 7, maxNights: 7 })).toHaveLength(1);
  });

  it("keeps one rate per week, in week order", () => {
    const prices = selectBookingManagerWeeklyPrices(
      [
        candidate({ priceMinor: 420_000, startDate: "2027-06-12" }),
        candidate({ priceMinor: 400_000, startDate: "2027-06-05" }),
        candidate({
          priceMinor: 400_000,
          startDate: "2027-06-05",
          startBaseId: "9",
          endBaseId: "9",
        }),
      ],
      { product: "Bareboat", homeBaseId: "194" },
    );
    expect(prices.map((item) => item.startDate)).toEqual(["2027-06-05", "2027-06-12"]);
  });
});

describe("createBookingManagerSeasonalPriceLoader with price terms", () => {
  it("asks for the terms of the yachts it prices and applies them", async () => {
    const giulia = yachtIdOf("Giulia");
    const client = fakeClient((query) =>
      Promise.resolve(
        String(query.dateFrom).startsWith("2026-12-26") ? (fixture.prices["2026-12-26"] ?? []) : [],
      ),
    );
    const resolver = fakeResolver(() => Promise.resolve(new Map([["ylst_giulia", giulia]])));
    const asked: string[][] = [];
    const load = createBookingManagerSeasonalPriceLoader({
      client,
      resolver,
      config,
      years: [2026],
      loadPriceTerms: (ids) => {
        asked.push([...ids]);
        const terms = termsOf(giulia);
        return Promise.resolve(new Map(terms ? [[giulia, terms]] : []));
      },
    });

    expect(await load(["ylst_giulia"])).toEqual(
      new Map([
        [
          "ylst_giulia",
          [
            {
              startDate: "2026-12-26",
              endDate: "2027-01-02",
              priceMinor: 288_100,
              currency: "EUR",
            },
          ],
        ],
      ]),
    );
    expect(asked).toEqual([[giulia]]);
  });
});
