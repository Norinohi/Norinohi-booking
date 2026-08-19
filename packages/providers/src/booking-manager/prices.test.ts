import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import type { CatalogueResolver, ExternalListingRef } from "../shared/catalogue-resolver";
import type { QueryValue } from "../shared/http-client";
import type { BookingManagerClient } from "./client";
import { type BookingManagerConfig, resolveBookingManagerConfig } from "./config";
import type { RestPrice } from "./endpoints";
import {
  charterSaturdays,
  createBookingManagerSeasonalPriceLoader,
  mapBookingManagerPriceRow,
} from "./prices";

const config: BookingManagerConfig = resolveBookingManagerConfig({
  BOOKING_MANAGER_BASE_URL: "https://www.booking-manager.com/api/v2",
  BOOKING_MANAGER_API_KEY: "t0ken",
  BOOKING_MANAGER_TIMEOUT_MS: 30_000,
  BOOKING_MANAGER_MIN_INTERVAL_MS: 0,
  BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES: 15,
  BOOKING_MANAGER_TIMEZONE: "Europe/Zagreb",
});

const row = (over: Partial<RestPrice> = {}): RestPrice => ({
  yachtId: 42,
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
  });
}

const listingRef: ExternalListingRef = {
  externalYachtId: "42",
  externalCompanyId: null,
  externalBaseId: null,
  listingSourceId: "lsrc_1",
};

function fakeResolver(
  toExternalListing: CatalogueResolver["toExternalListing"],
): CatalogueResolver {
  return {
    providerId: () => Promise.resolve("prv_booking_manager"),
    toExternalListing,
    toListingId: () => Promise.resolve(null),
    toExternalAmenityIds: () => Promise.resolve([]),
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
  it("keys the week to its check-in date on both ends", () => {
    // priceAt matches startDate <= date <= endDate, so a week must cover exactly
    // its own check-in or it wins the lookup for the following Saturday too.
    expect(mapBookingManagerPriceRow(row(), "2027-01-02")).toEqual({
      startDate: "2027-01-02",
      endDate: "2027-01-02",
      priceMinor: 123_450,
      currency: "EUR",
    });
  });

  it("drops a row the vendor answered for a different period", () => {
    expect(mapBookingManagerPriceRow(row(), "2027-01-09")).toBeNull();
  });

  it("falls back to the requested currency when the row omits one", () => {
    expect(mapBookingManagerPriceRow(row({ currency: null }), "2027-01-02", "EUR")).toMatchObject({
      currency: "EUR",
    });
  });

  it.each([null, undefined])("drops a row with price %o", (price) => {
    expect(mapBookingManagerPriceRow(row({ price }), "2027-01-02")).toBeNull();
  });

  it.each([0, -1])("drops a row priced at %o rather than advertising it", (price) => {
    // The card's "from" price is the minimum across periods, so one zero week would
    // price the whole boat at nothing. Observed live: the vendor sends 0 for the
    // year-end week on every yacht in the test fleet.
    expect(mapBookingManagerPriceRow(row({ price }), "2027-01-02")).toBeNull();
  });

  it("drops a row with no usable currency", () => {
    expect(mapBookingManagerPriceRow(row({ currency: null }), "2027-01-02")).toBeNull();
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

    const resolver = fakeResolver((listingId) =>
      listingId === "ylst_unlinked"
        ? Promise.reject(new Error("no source"))
        : Promise.resolve(listingRef),
    );

    return { calls, client, resolver };
  }

  it("sweeps a week at a time for the whole fleet, never per yacht", async () => {
    const { calls, client, resolver } = harness([row()]);
    const load = createBookingManagerSeasonalPriceLoader({
      client,
      resolver,
      config,
      years: [2027],
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
    });

    expect(await load(["ylst_a"])).toEqual(
      new Map([
        [
          "ylst_a",
          [
            {
              startDate: "2027-01-02",
              endDate: "2027-01-02",
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
    });

    expect(await load(["ylst_unlinked"])).toEqual(new Map());
  });

  it("retries the sweep after a failure instead of caching an empty fleet", async () => {
    let attempts = 0;
    const client = fakeClient(() => {
      attempts += 1;
      return attempts <= 1 ? Promise.reject(new Error("boom")) : Promise.resolve([]);
    });
    const resolver = fakeResolver(() => Promise.resolve(listingRef));

    const load = createBookingManagerSeasonalPriceLoader({
      client,
      resolver,
      config,
      years: [2027],
    });

    await expect(load(["ylst_a"])).rejects.toThrow("boom");
    await expect(load(["ylst_a"])).resolves.toEqual(new Map());
  });
});
