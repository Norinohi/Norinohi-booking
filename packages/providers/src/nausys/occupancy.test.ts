import { describe, expect, it } from "vitest";

import { ContractError } from "../shared/errors";
import { SequentialQueue } from "../shared/queue";
import { occupiedIntervalSchema } from "../sync/availability-writer";
import { NausysClient } from "./client";
import type { NausysConfig } from "./config";
import freeYachtsSearchFixture from "./fixtures/freeYachtsSearch.json" with { type: "json" };
import occupancyFixture from "./fixtures/occupancy.json" with { type: "json" };
import {
  createNausysAvailabilitySource,
  fetchNausysFreeYachtsSearch,
  fetchNausysOccupancy,
  mapFreeYachtToConfirmedOffer,
  mapNausysPriceLists,
  mapOccupancyDump,
  mapOccupancyReservation,
  parseNausysHotWindowCursor,
} from "./occupancy";
import { FakeNausysTransport } from "./testing/fake-transport";

const config: NausysConfig = {
  baseUrl: "https://ws-test.nausys.com",
  username: "agency-user",
  password: "hunter2",
  timeoutMs: 1000,
  minIntervalMs: 0,
  optionSafetyMarginMinutes: 15,
  optionTimeZone: "Europe/Zagreb",
  queueKey: "nausys:agency-user",
};

type OccupancyResponse = {
  status: string;
  companyId: number;
  year: number;
  reservations: (Record<string, unknown> & {
    id: number;
    yachtId: number;
    reservationType: string;
    periodFrom: string;
    periodTo: string;
  })[];
};

type SearchResponse = {
  status: string;
  totalCount: number;
  totalPages: number;
  currentPage: number;
  freeYachtsInPeriod: (Record<string, unknown> & {
    yachtId: number;
    periodFrom: string;
    periodTo: string;
    status: string;
    price: Record<string, unknown> & { clientPrice: string; currency: string };
  })[];
};

function occupancyResponse(): OccupancyResponse {
  return structuredClone(occupancyFixture) as unknown as OccupancyResponse;
}

function searchResponse(): SearchResponse {
  return structuredClone(freeYachtsSearchFixture) as unknown as SearchResponse;
}

function build() {
  const transport = new FakeNausysTransport();
  const client = new NausysClient({
    config,
    fetchImpl: transport.fetch,
    queue: new SequentialQueue(),
    retry: { maxAttempts: 1 },
  });
  return { client, transport };
}

describe("fetchNausysOccupancy", () => {
  it("calls occupancy/{companyId}/{year} with top-level credentials", async () => {
    const { client, transport } = build();

    const dump = await fetchNausysOccupancy(client, { companyId: "102701", year: 2026 });

    expect(transport.calls[0]?.endpoint).toBe("occupancy/102701/2026");
    // The exception the client already models: occupancy lives under
    // yachtReservation but takes the catalogue auth shape.
    expect(transport.lastBody("occupancy")).toMatchObject({
      username: "agency-user",
      password: "hunter2",
    });
    expect(dump.reservations).toHaveLength(3);
    expect(dump.year).toBe(2026);
  });

  it("addresses occupancy2 when a season is given instead of a year", async () => {
    const { client, transport } = build();
    transport.respondWith("occupancy2", occupancyResponse());

    await fetchNausysOccupancy(client, { companyId: "102701", seasonId: 771 });

    expect(transport.calls[0]?.endpoint).toBe("occupancy2/102701/771");
  });
});

describe("mapOccupancyReservation", () => {
  it("maps RESERVATION to occupied and OPTION to option, on ISO dates", () => {
    const intervals = mapOccupancyDump({
      companyId: "102701",
      year: 2026,
      reservations: occupancyResponse().reservations as never,
    });

    expect(intervals.map((interval) => interval.status)).toEqual([
      "occupied",
      "option",
      "occupied",
    ]);
    expect(intervals[0]).toMatchObject({
      externalYachtId: "4711001",
      startDate: "2026-06-27",
      endDate: "2026-07-04",
    });
    expect(intervals[1]).toMatchObject({ startDate: "2026-07-18", endDate: "2026-07-25" });
    expect(intervals[2]).toMatchObject({ externalYachtId: "4711002", startDate: "2026-07-11" });
    for (const interval of intervals) {
      expect(() => occupiedIntervalSchema.parse(interval)).not.toThrow();
    }
  });

  it("gives two identical reservations the same source hash", () => {
    const [reservation] = occupancyResponse().reservations;
    const first = mapOccupancyReservation(reservation as never);
    const second = mapOccupancyReservation(structuredClone(reservation) as never);

    expect(first.sourceHash).toBe(second.sourceHash);
  });

  it("throws on a malformed period rather than dropping it", () => {
    const response = occupancyResponse();
    const [reservation] = response.reservations;
    if (!reservation) throw new Error("fixture has no reservations");
    reservation.periodTo = "31.02.2026";

    // Dropping it would mean advertising a week the vendor has already sold.
    expect(() => mapOccupancyReservation(reservation as never)).toThrow(ContractError);
  });

  it("throws when a period ends before it starts", () => {
    const response = occupancyResponse();
    const [reservation] = response.reservations;
    if (!reservation) throw new Error("fixture has no reservations");
    reservation.periodTo = reservation.periodFrom;

    expect(() => mapOccupancyReservation(reservation as never)).toThrow(ContractError);
  });
});

describe("fetchNausysFreeYachtsSearch", () => {
  it("walks every page sequentially and stops at totalPages", async () => {
    const { client, transport } = build();
    for (const page of [1, 2, 3]) {
      const body = searchResponse();
      body.currentPage = page;
      transport.respondOnceWith("freeYachtsSearch", body);
    }

    const pages: number[] = [];
    for await (const page of fetchNausysFreeYachtsSearch(client, {
      periodFrom: "2026-07-04",
      periodTo: "2026-07-11",
      resultsPerPage: 10,
    })) {
      pages.push(page.page);
    }

    expect(pages).toEqual([1, 2, 3]);
    expect(transport.calls.map((call) => call.body.resultsPage)).toEqual([1, 2, 3]);
    expect(transport.lastBody("freeYachtsSearch")).toMatchObject({
      periodFrom: "04.07.2026",
      periodTo: "11.07.2026",
      resultsPerPage: 10,
    });
    // The vendor forbids parallel calls; the pages must have gone out one at a time.
    expect(transport.maxConcurrent).toBe(1);
  });

  it("issues no further request once the consumer stops pulling", async () => {
    const { client, transport } = build();

    for await (const _page of fetchNausysFreeYachtsSearch(client, {
      periodFrom: "2026-07-04",
      periodTo: "2026-07-11",
    })) {
      break;
    }

    expect(transport.callCount("freeYachtsSearch")).toBe(1);
  });

  it("resumes from a page number", async () => {
    const { client, transport } = build();
    const body = searchResponse();
    body.currentPage = 3;
    transport.respondWith("freeYachtsSearch", body);

    const pages = [];
    for await (const page of fetchNausysFreeYachtsSearch(client, {
      periodFrom: "2026-07-04",
      periodTo: "2026-07-11",
      startPage: 3,
    })) {
      pages.push(page.page);
    }

    expect(pages).toEqual([3]);
    expect(transport.calls[0]?.body.resultsPage).toBe(3);
  });
});

describe("mapFreeYachtToConfirmedOffer", () => {
  it("maps clientPrice to minor units", () => {
    const [yacht] = searchResponse().freeYachtsInPeriod;

    expect(mapFreeYachtToConfirmedOffer(yacht as never)).toMatchObject({
      externalYachtId: "4711001",
      startDate: "2026-07-04",
      endDate: "2026-07-11",
      priceMinor: 334000,
      currency: "EUR",
    });
  });

  it("drops an UNDER_OPTION yacht", () => {
    const [yacht] = searchResponse().freeYachtsInPeriod;
    if (!yacht) throw new Error("fixture has no results");
    yacht.status = "UNDER_OPTION";

    expect(mapFreeYachtToConfirmedOffer(yacht as never)).toBeNull();
  });

  it("never carries agencyPrice into the offer", () => {
    const [yacht] = searchResponse().freeYachtsInPeriod;
    if (!yacht) throw new Error("fixture has no results");
    yacht.price.agencyPrice = "2900.00";

    const offer = mapFreeYachtToConfirmedOffer(yacht as never);

    expect(JSON.stringify(offer)).not.toContain("2900");
  });
});

describe("createNausysAvailabilitySource", () => {
  it("lists one scope per company and year", async () => {
    const { client } = build();
    const source = createNausysAvailabilitySource({
      client,
      companyIds: ["102701", "102702"],
      years: [2026, 2027],
    });

    expect(await source.listScopes()).toEqual([
      { scopeKey: "102701", year: 2026 },
      { scopeKey: "102701", year: 2027 },
      { scopeKey: "102702", year: 2026 },
      { scopeKey: "102702", year: 2027 },
    ]);
  });

  it("has no hot pass when no windows are configured", () => {
    const { client } = build();
    const source = createNausysAvailabilitySource({
      client,
      companyIds: ["102701"],
      years: [2026],
    });

    expect(source.searchConfirmed).toBeUndefined();
  });

  it("carries the resume position forward page by page", async () => {
    const { client, transport } = build();
    const body = searchResponse();
    body.totalPages = 2;
    body.currentPage = 1;
    transport.respondOnceWith("freeYachtsSearch", body);
    const second = searchResponse();
    second.totalPages = 2;
    second.currentPage = 2;
    transport.respondWith("freeYachtsSearch", second);

    const source = createNausysAvailabilitySource({
      client,
      companyIds: [],
      years: [],
      hotWindows: [
        { periodFrom: "2026-07-04", periodTo: "2026-07-11", locations: [53271] },
        { periodFrom: "2026-07-11", periodTo: "2026-07-18" },
      ],
    });

    const cursors: unknown[] = [];
    for await (const page of source.searchConfirmed?.(null) ?? []) {
      cursors.push(page.cursor);
      if (cursors.length === 2) break;
    }

    expect(cursors).toEqual([
      { windowIndex: 0, page: 2 },
      { windowIndex: 1, page: 1 },
    ]);
  });

  it("restarts at the persisted window and page", async () => {
    const { client, transport } = build();
    transport.respondWith("freeYachtsSearch", searchResponse());

    const source = createNausysAvailabilitySource({
      client,
      companyIds: [],
      years: [],
      hotWindows: [
        { periodFrom: "2026-07-04", periodTo: "2026-07-11" },
        { periodFrom: "2026-07-11", periodTo: "2026-07-18" },
      ],
    });

    for await (const _page of source.searchConfirmed?.({ windowIndex: 1, page: 2 }) ?? []) {
      break;
    }

    expect(transport.calls[0]?.body).toMatchObject({
      periodFrom: "11.07.2026",
      resultsPage: 2,
    });
  });
});

describe("parseNausysHotWindowCursor", () => {
  it("rejects anything that is not a window and a page", () => {
    expect(parseNausysHotWindowCursor({ windowIndex: 2, page: 7 })).toEqual({
      windowIndex: 2,
      page: 7,
    });
    expect(parseNausysHotWindowCursor({ step: 3 })).toBeNull();
    expect(parseNausysHotWindowCursor(null)).toBeNull();
  });
});

describe("mapNausysPriceLists", () => {
  it("reads nested prices and flat rows alike", () => {
    const prices = mapNausysPriceLists([
      {
        externalId: "9001",
        payload: {
          id: 9001,
          yachtId: 4711001,
          currency: "EUR",
          prices: [
            { dateFrom: "30.05.2026", dateTo: "26.06.2026", price: "3200.00" },
            { dateFrom: "27.06.2026", dateTo: "29.08.2026", price: "3900.00" },
          ],
        },
      },
      {
        externalId: "9002",
        payload: {
          id: 9002,
          yachtId: "4711002",
          dateFrom: "30.05.2026",
          dateTo: "29.08.2026",
          price: 5890,
          currency: "EUR",
        },
      },
    ]);

    expect(prices.get("4711001")).toEqual([
      { startDate: "2026-05-30", endDate: "2026-06-26", priceMinor: 320000, currency: "EUR" },
      { startDate: "2026-06-27", endDate: "2026-08-29", priceMinor: 390000, currency: "EUR" },
    ]);
    expect(prices.get("4711002")?.[0]?.priceMinor).toBe(589000);
  });

  it("drops an unreadable row rather than the whole list", () => {
    const prices = mapNausysPriceLists([
      {
        externalId: "9001",
        payload: {
          yachtId: 4711001,
          prices: [
            { dateFrom: "not-a-date", dateTo: "26.06.2026", price: "3200.00" },
            { dateFrom: "27.06.2026", dateTo: "29.08.2026", price: "3900.00", currency: "EUR" },
          ],
        },
      },
    ]);

    expect(prices.get("4711001")).toHaveLength(1);
  });
});
