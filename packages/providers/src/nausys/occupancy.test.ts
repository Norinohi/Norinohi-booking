import { describe, expect, it } from "vitest";
import { z } from "zod";

import { unscopedCompanies } from "../shared/company-scope";
import { ContractError } from "../shared/errors";
import { looseJsonObject } from "../shared/json";
import { SequentialQueue } from "../shared/queue";
import { occupiedIntervalSchema } from "../sync/availability-writer";
import { NausysClient } from "./client";
import type { NausysConfig } from "./config";
import {
  restFreeYachtSchema,
  restFreeYachtsSearchResponseSchema,
  restOccupancyReservationSchema,
  restOccupancyResponseSchema,
} from "./endpoints";
import freeYachtsSearchFixture from "./fixtures/freeYachtsSearch.json" with { type: "json" };
import occupancyFixture from "./fixtures/occupancy.json" with { type: "json" };
import priceListsFixture from "./fixtures/priceLists-recorded.json" with { type: "json" };
import {
  createNausysAvailabilitySource,
  fetchNausysOccupancy,
  mapFreeYachtToConfirmedOffer,
  mapNausysPriceLists,
  mapOccupancyDump,
  mapOccupancyReservation,
  type NausysPriceListIssue,
} from "./occupancy";
import { FakeNausysTransport } from "./testing/fake-transport";

const config: NausysConfig = {
  baseUrl: "https://ws-test.nausys.com",
  username: "agency-user",
  password: "hunter2",
  timeoutMs: 1000,
  syncTimeoutMs: 1000,
  minIntervalMs: 0,
  optionSafetyMarginMinutes: 15,
  optionTimeZone: "Europe/Zagreb",
  companyScope: unscopedCompanies,
  queueKey: "nausys:agency-user",
};

type OccupancyReservation = z.infer<typeof restOccupancyReservationSchema>;
type FreeYacht = z.infer<typeof restFreeYachtSchema>;

/**
 * Running the recorded responses through the adapter's own schemas is what gives
 * the fixtures their vendor types, and it fails loudly if a fixture drifts from
 * the contract the mappers are written against.
 */
function occupancyResponse() {
  return restOccupancyResponseSchema.parse(structuredClone(occupancyFixture));
}

function occupancyReservations(): OccupancyReservation[] {
  return occupancyResponse().reservations ?? [];
}

function firstReservation(): OccupancyReservation {
  const [reservation] = occupancyReservations();
  if (!reservation) throw new Error("fixture has no reservations");
  return reservation;
}

function searchResponse() {
  return restFreeYachtsSearchResponseSchema.parse(structuredClone(freeYachtsSearchFixture));
}

function firstFreeYacht(): FreeYacht {
  const [yacht] = searchResponse().freeYachtsInPeriod ?? [];
  if (!yacht) throw new Error("fixture has no results");
  return yacht;
}

/**
 * Only the fields the matrix mapping reads are declared; the catchall keeps the
 * rest of the recorded entry, including the `type` the mapper branches on.
 */
const recordedPriceListSchema = looseJsonObject({
  id: z.number().int(),
  currency: z.string(),
  columns: z.array(
    looseJsonObject({
      periods: z.array(looseJsonObject({ periodFrom: z.string(), periodTo: z.string() })),
    }),
  ),
  rows: z.array(
    looseJsonObject({
      yachtId: z.union([z.number().int(), z.string()]),
      prices: z.array(z.union([z.string(), z.number()])),
    }),
  ),
});

type RecordedPriceList = z.infer<typeof recordedPriceListSchema>;

const recordedPriceLists = looseJsonObject({
  priceLists: z.array(recordedPriceListSchema),
}).parse(priceListsFixture).priceLists;

/** Trimmed rows aside, `fixtures/priceLists-recorded.json` is the live response. */
const WEEKLY_LIST_ID = 60808865;
/** The vendor publishes the same nine columns and rows again under a second id. */
const DUPLICATE_WEEKLY_LIST_ID = 76510827;
const DAILY_LIST_ID = 74041227;

function recordedPriceList(id: number): RecordedPriceList {
  const list = recordedPriceLists.find((entry) => entry.id === id);
  if (!list) throw new Error(`price list ${id} is not in the recorded fixture`);
  return structuredClone(list);
}

function priceListRecord(id: number) {
  return { externalId: String(id), payload: recordedPriceList(id) };
}

/** The nine-column WEEKLY list, cloned so a test can bend one field of it. */
function weeklyList(): RecordedPriceList {
  return recordedPriceList(WEEKLY_LIST_ID);
}

function build() {
  const transport = new FakeNausysTransport();
  // The sync lane, as the provider wires it: this is the one the vendor's
  // sequential-only rule still governs.
  const client = new NausysClient({
    config,
    fetchImpl: transport.fetch,
    queue: new SequentialQueue(),
    retry: { maxAttempts: 1 },
    lane: "sync",
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
    const { intervals } = mapOccupancyDump({
      companyId: "102701",
      year: 2026,
      reservations: occupancyReservations(),
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
    const reservation = firstReservation();
    const first = mapOccupancyReservation(reservation);
    const second = mapOccupancyReservation(structuredClone(reservation));

    expect(first?.sourceHash).toBe(second?.sourceHash);
  });

  it("throws on a malformed period rather than dropping it", () => {
    const reservation = firstReservation();
    reservation.periodTo = "31.02.2026";

    // Dropping it would mean advertising a week the vendor has already sold.
    expect(() => mapOccupancyReservation(reservation)).toThrow(ContractError);
  });

  it("throws when a period ends before it starts", () => {
    const reservation = firstReservation();
    reservation.periodTo = "26.06.2026";

    expect(() => mapOccupancyReservation(reservation)).toThrow(ContractError);
  });

  it("drops a same-day reservation instead of refusing it", () => {
    const reservation = firstReservation();
    reservation.periodTo = reservation.periodFrom;

    // NauSYS publishes these routinely and they block no night, so the row is worth
    // nothing and its yacht is worth keeping.
    expect(mapOccupancyReservation(reservation)).toBeNull();
  });

  it("keeps the rest of the fleet when one yacht's period runs backwards", () => {
    const reservations = occupancyReservations();
    const [bad] = reservations;
    if (!bad) throw new Error("fixture lost its first reservation");
    bad.periodTo = "26.06.2026";

    const dump = mapOccupancyDump({ companyId: "102701", year: 2026, reservations });

    expect(dump.quarantinedYachtIds).toEqual([String(bad.yachtId)]);
    expect(dump.issues).toHaveLength(1);
    // The other yacht's calendar is untouched; only 4711001 loses its rows.
    expect(dump.intervals.every((interval) => interval.externalYachtId !== "4711001")).toBe(true);
    expect(dump.intervals.map((interval) => interval.externalYachtId)).toContain("4711002");
  });

  it("drops same-day rows without quarantining anything", () => {
    const reservations = occupancyReservations();
    const [first] = reservations;
    if (!first) throw new Error("fixture lost its first reservation");
    first.periodTo = first.periodFrom;

    const dump = mapOccupancyDump({ companyId: "102701", year: 2026, reservations });

    expect(dump.quarantinedYachtIds).toBeUndefined();
    expect(dump.intervals).toHaveLength(reservations.length - 1);
  });
});

describe("mapFreeYachtToConfirmedOffer", () => {
  it("maps clientPrice to minor units", () => {
    const yacht = firstFreeYacht();

    expect(mapFreeYachtToConfirmedOffer(yacht)).toMatchObject({
      externalYachtId: "4711001",
      startDate: "2026-07-04",
      endDate: "2026-07-11",
      priceMinor: 334000,
      currency: "EUR",
    });
  });

  /*
   * The card prints rate plus unavoidable fees as one figure, and the read model prefers this
   * total over its own reconstruction from the catalogue ladder. Both halves have to come from
   * the offer, or the card adds a vendor price to a guessed fee.
   */
  it("totals the offer's own obligatory extras", () => {
    // The search fixture's one obligatory service, at 150.00 for one unit.
    expect(mapFreeYachtToConfirmedOffer(firstFreeYacht())).toMatchObject({
      obligatoryExtrasMinor: 15_000,
    });
  });

  it("says nothing about fees when the offer lists none, leaving the catalogue to answer", () => {
    const yacht = firstFreeYacht();
    delete yacht.obligatoryExtras;

    expect(mapFreeYachtToConfirmedOffer(yacht)).not.toHaveProperty("obligatoryExtrasMinor");
  });

  it("keeps an offer that really charges nothing as a zero", () => {
    const yacht = firstFreeYacht();
    yacht.obligatoryExtras = [];

    expect(mapFreeYachtToConfirmedOffer(yacht)).toMatchObject({ obligatoryExtrasMinor: 0 });
  });

  it("refuses to total fees it cannot add up, rather than understating them", () => {
    const yacht = firstFreeYacht();
    const [extra] = yacht.obligatoryExtras ?? [];
    if (extra) extra.currency = "HRK";

    expect(mapFreeYachtToConfirmedOffer(yacht)).not.toHaveProperty("obligatoryExtrasMinor");
  });

  /*
   * The card strikes this figure through beside the price. It comes back only where the
   * vendor's own discounts account for the whole reduction, which is the same test the quote
   * applies before it shows a discount line -- so the two surfaces never disagree about
   * whether a charter is on offer.
   */
  it("carries the list price where the discounts account for the whole reduction", () => {
    const yacht = firstFreeYacht();
    yacht.price.priceListPrice = "4000.00";
    yacht.price.clientPrice = "3340.00";
    yacht.price.discounts = [
      { discountItemId: 1, type: "PERCENTAGE", amount: "10" },
      { discountItemId: 2, type: "AMOUNT", amount: "260.00" },
    ];

    expect(mapFreeYachtToConfirmedOffer(yacht)).toMatchObject({
      priceMinor: 334_000,
      listPriceMinor: 400_000,
    });
  });

  it("strikes nothing through when the discounts do not add up to the price billed", () => {
    const yacht = firstFreeYacht();
    yacht.price.priceListPrice = "4000.00";
    yacht.price.clientPrice = "3340.00";
    yacht.price.discounts = [{ discountItemId: 1, type: "PERCENTAGE", amount: "10" }];

    expect(mapFreeYachtToConfirmedOffer(yacht)).not.toHaveProperty("listPriceMinor");
  });

  it("strikes nothing through on a charter sold at its list price", () => {
    const yacht = firstFreeYacht();
    yacht.price.priceListPrice = yacht.price.clientPrice;
    yacht.price.discounts = [{ discountItemId: 1, type: "AMOUNT", amount: "0.00" }];

    expect(mapFreeYachtToConfirmedOffer(yacht)).not.toHaveProperty("listPriceMinor");
  });

  it("drops an UNDER_OPTION yacht", () => {
    const yacht = firstFreeYacht();
    yacht.status = "UNDER_OPTION";

    expect(mapFreeYachtToConfirmedOffer(yacht)).toBeNull();
  });

  it("never carries agencyPrice into the offer", () => {
    const yacht = firstFreeYacht();
    yacht.price.agencyPrice = "2900.00";

    const offer = mapFreeYachtToConfirmedOffer(yacht);

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
      loadYachtIds: () => Promise.resolve(["4711001"]),
    });

    expect(source.searchConfirmed).toBeUndefined();
  });

  /* The pass prices our own hulls by id, so with no ids there is nothing it could ask. */
  it("has no hot pass when the fleet cannot be named", () => {
    const { client } = build();
    const source = createNausysAvailabilitySource({
      client,
      companyIds: ["102701"],
      years: [2026],
      hotWindows: [{ periodFrom: "2026-07-04", periodTo: "2026-07-11" }],
    });

    expect(source.searchConfirmed).toBeUndefined();
  });

  it("asks freeYachts for our own hulls, one page per period", async () => {
    const { client, transport } = build();
    transport.respondWith("freeYachts", { status: "OK", freeYachts: [] });

    const source = createNausysAvailabilitySource({
      client,
      companyIds: ["102701"],
      years: [],
      hotWindows: [
        { periodFrom: "2026-07-04", periodTo: "2026-07-11" },
        { periodFrom: "2026-07-11", periodTo: "2026-07-18" },
      ],
      loadYachtIds: () => Promise.resolve(["4711001", "4711002"]),
    });

    const pages = [];
    for await (const page of source.searchConfirmed?.(null) ?? []) pages.push(page);

    expect(transport.calls.map((call) => call.body)).toMatchObject([
      { periodFrom: "04.07.2026", periodTo: "11.07.2026", yachts: [4_711_001, 4_711_002] },
      { periodFrom: "11.07.2026", periodTo: "18.07.2026", yachts: [4_711_001, 4_711_002] },
    ]);
    expect(pages.map((page) => page.cursor)).toEqual([
      { windowIndex: 1, page: 1 },
      { windowIndex: 2, page: 1 },
    ]);
  });

  /*
   * The whole point of the targeting: a week 110 hulls advertise costs 110 asks, not 7,484.
   * The pass is budgeted on the clock, and asking the fleet about every window spent that
   * budget three periods in, leaving the rest of the advertised set unpriced.
   */
  it("asks only the hulls advertising a window that names them", async () => {
    const { client, transport } = build();
    transport.respondWith("freeYachts", { status: "OK", freeYachts: [] });

    const source = createNausysAvailabilitySource({
      client,
      companyIds: ["102701"],
      years: [],
      hotWindows: [
        { periodFrom: "2026-07-04", periodTo: "2026-07-11", yachtIds: ["4711002"] },
        { periodFrom: "2026-07-11", periodTo: "2026-07-18" },
      ],
      loadYachtIds: () => Promise.resolve(["4711001", "4711002"]),
    });

    const pages = [];
    for await (const page of source.searchConfirmed?.(null) ?? []) pages.push(page);

    expect(transport.calls.map((call) => call.body)).toMatchObject([
      { periodFrom: "04.07.2026", yachts: [4_711_002] },
      { periodFrom: "11.07.2026", yachts: [4_711_001, 4_711_002] },
    ]);
  });

  /*
   * A narrowed ask has to narrow what its silence means with it, or the first targeted window
   * refuses the rest of the fleet for a charter nobody put to the vendor on their behalf.
   */
  it("licenses refusals only for the hulls it asked about", async () => {
    const { client, transport } = build();
    transport.respondWith("freeYachts", { status: "OK", freeYachts: [] });

    const source = createNausysAvailabilitySource({
      client,
      companyIds: ["102701"],
      years: [],
      hotWindows: [
        { periodFrom: "2026-07-04", periodTo: "2026-07-11", yachtIds: ["4711002"] },
        { periodFrom: "2026-07-11", periodTo: "2026-07-18" },
      ],
      loadYachtIds: () => Promise.resolve(["4711001", "4711002"]),
    });

    const pages = [];
    for await (const page of source.searchConfirmed?.(null) ?? []) pages.push(page);

    expect(pages.map((page) => page.swept?.externalYachtIds)).toEqual([["4711002"], null]);
  });

  /* A hull that left the account between the two reads is not one to ask about. */
  it("skips a window whose hulls we no longer list, without refusing anyone", async () => {
    const { client, transport } = build();
    transport.respondWith("freeYachts", { status: "OK", freeYachts: [] });

    const source = createNausysAvailabilitySource({
      client,
      companyIds: ["102701"],
      years: [],
      hotWindows: [{ periodFrom: "2026-07-04", periodTo: "2026-07-11", yachtIds: ["9999999"] }],
      loadYachtIds: () => Promise.resolve(["4711001"]),
    });

    const pages = [];
    for await (const page of source.searchConfirmed?.(null) ?? []) pages.push(page);

    expect(transport.calls).toHaveLength(0);
    expect(pages).toEqual([{ offers: [], cursor: { windowIndex: 1, page: 1 } }]);
  });

  it("restarts at the persisted window", async () => {
    const { client, transport } = build();
    transport.respondWith("freeYachts", { status: "OK", freeYachts: [] });

    const source = createNausysAvailabilitySource({
      client,
      companyIds: [],
      years: [],
      hotWindows: [
        { periodFrom: "2026-07-04", periodTo: "2026-07-11" },
        { periodFrom: "2026-07-11", periodTo: "2026-07-18" },
      ],
      loadYachtIds: () => Promise.resolve(["4711001"]),
    });

    for await (const _page of source.searchConfirmed?.({ windowIndex: 1, page: 2 }) ?? []) break;

    expect(transport.calls[0]?.body).toMatchObject({ periodFrom: "11.07.2026" });
  });
});

describe("mapNausysPriceLists", () => {
  it("expands the recorded matrix positionally, one entry per column period", () => {
    const prices = mapNausysPriceLists([priceListRecord(WEEKLY_LIST_ID)]);

    // Row 22287918 is ["1500","1500","2500","2600","2900","2800","3000","3500","1500"]
    // against the nine recorded columns, so 2600 belongs to 30.05-26.06 and to
    // neither of the columns beside it.
    expect(prices.get("22287918")).toEqual([
      { startDate: "2026-01-01", endDate: "2026-04-17", priceMinor: 150000, currency: "EUR" },
      { startDate: "2026-04-18", endDate: "2026-05-08", priceMinor: 150000, currency: "EUR" },
      { startDate: "2026-05-09", endDate: "2026-05-29", priceMinor: 250000, currency: "EUR" },
      { startDate: "2026-05-30", endDate: "2026-06-26", priceMinor: 260000, currency: "EUR" },
      { startDate: "2026-06-27", endDate: "2026-07-17", priceMinor: 290000, currency: "EUR" },
      { startDate: "2026-07-18", endDate: "2026-08-28", priceMinor: 280000, currency: "EUR" },
      { startDate: "2026-08-29", endDate: "2026-10-16", priceMinor: 300000, currency: "EUR" },
      { startDate: "2026-10-17", endDate: "2026-11-06", priceMinor: 350000, currency: "EUR" },
      { startDate: "2026-11-07", endDate: "2026-12-31", priceMinor: 150000, currency: "EUR" },
    ]);
  });

  it("converts the decimal strings on their digits rather than by rounding", () => {
    const list = weeklyList();
    list.rows = [
      { yachtId: 4711001, prices: ["1500", ...list.columns.slice(1).map(() => "1234.567")] },
    ];

    const prices = mapNausysPriceLists([{ externalId: "9001", payload: list }]);

    expect(prices.get("4711001")?.[0]?.priceMinor).toBe(150000);
    // Precision beyond the currency's is truncated: rounding a third decimal up
    // would quietly overcharge by a cent.
    expect(prices.get("4711001")?.[1]?.priceMinor).toBe(123456);
  });

  it("gives every period of a multi-period column the same price", () => {
    const list = weeklyList();
    // The vendor reuses one rate for two disjoint shoulder ranges by folding them
    // into a single column, which then still consumes exactly one price. This
    // company's recorded lists happen to be one period per column, so the shape is
    // built here out of their own ranges.
    list.columns = [
      {
        periods: [
          { periodFrom: "18.04.2026", periodTo: "08.05.2026" },
          { periodFrom: "17.10.2026", periodTo: "30.10.2026" },
        ],
      },
      { periods: [{ periodFrom: "27.06.2026", periodTo: "17.07.2026" }] },
    ];
    list.rows = [{ yachtId: 4711001, prices: ["1500", "2900"] }];

    expect(mapNausysPriceLists([{ externalId: "9001", payload: list }]).get("4711001")).toEqual([
      { startDate: "2026-04-18", endDate: "2026-05-08", priceMinor: 150000, currency: "EUR" },
      { startDate: "2026-06-27", endDate: "2026-07-17", priceMinor: 290000, currency: "EUR" },
      { startDate: "2026-10-17", endDate: "2026-10-30", priceMinor: 150000, currency: "EUR" },
    ]);
  });

  it("skips a row whose price count does not match the columns instead of zipping it", () => {
    const list = weeklyList();
    const [intact] = list.rows;
    const short = { yachtId: 4711001, prices: list.columns.slice(1).map(() => "1500") };
    list.rows = [short, ...(intact ? [intact] : [])];

    const issues: NausysPriceListIssue[] = [];
    const prices = mapNausysPriceLists([{ externalId: "9001", payload: list }], (issue) =>
      issues.push(issue),
    );

    // Zipping the eight prices onto the nine columns would have sold the whole
    // fleet's August at its April rate, so the row is refused outright.
    expect(prices.has("4711001")).toBe(false);
    expect(issues).toEqual([
      {
        priceListId: "9001",
        externalYachtId: "4711001",
        reason: "column_count_mismatch",
        detail: "8 prices for 9 columns",
      },
    ]);
    expect(prices.get("22287918")).toHaveLength(9);
  });

  it("takes the currency from the list, not from a default", () => {
    const list = weeklyList();
    list.currency = "GBP";
    list.rows = [{ yachtId: 4711001, prices: list.columns.map(() => "1500") }];

    const prices = mapNausysPriceLists([{ externalId: "9001", payload: list }]);

    expect(prices.get("4711001")?.every((price) => price.currency === "GBP")).toBe(true);
  });

  it("keeps both lists when the vendor publishes a yacht twice", () => {
    const prices = mapNausysPriceLists([
      priceListRecord(WEEKLY_LIST_ID),
      priceListRecord(DUPLICATE_WEEKLY_LIST_ID),
    ]);

    // The two recorded lists carry the same rows under different ids. Overwriting
    // on the second would be invisible here but would drop real seasons for a
    // yacht that is genuinely priced twice.
    expect(prices.get("22287918")).toHaveLength(18);
  });

  it("refuses a daily list rather than pricing a week at a day's rate", () => {
    const issues: NausysPriceListIssue[] = [];
    const prices = mapNausysPriceLists([priceListRecord(DAILY_LIST_ID)], (issue) =>
      issues.push(issue),
    );

    expect(prices.size).toBe(0);
    expect(issues).toEqual([
      { priceListId: String(DAILY_LIST_ID), reason: "unsupported_unit", detail: "DAILY" },
    ]);
  });

  it("keeps the remaining columns aligned when one period is malformed", () => {
    const list = weeklyList();
    const broken = list.columns[1];
    if (broken) broken.periods = [{ periodFrom: "31.02.2026", periodTo: "08.05.2026" }];
    list.rows = [{ yachtId: 4711001, prices: list.columns.map((_, index) => `${index + 1}000`) }];

    const issues: NausysPriceListIssue[] = [];
    const prices = mapNausysPriceLists([{ externalId: "9001", payload: list }], (issue) =>
      issues.push(issue),
    );

    // Column 1 is emptied, not removed, so column 2 still carries "3000".
    expect(prices.get("4711001")).toHaveLength(8);
    expect(prices.get("4711001")?.[1]).toEqual({
      startDate: "2026-05-09",
      endDate: "2026-05-29",
      priceMinor: 300000,
      currency: "EUR",
    });
    expect(issues.map((issue) => issue.reason)).toEqual(["malformed_period"]);
  });

  it("reports a row it cannot read and keeps the rest of the list", () => {
    const list = weeklyList();
    list.rows = [{ yachtId: 4711001, prices: list.columns.map(() => 1500) }, ...list.rows];

    const issues: NausysPriceListIssue[] = [];
    const prices = mapNausysPriceLists([{ externalId: "9001", payload: list }], (issue) =>
      issues.push(issue),
    );

    expect(prices.has("4711001")).toBe(false);
    expect(prices.get("22287918")).toHaveLength(9);
    expect(issues.map((issue) => issue.reason)).toEqual(["row_unreadable"]);
  });
});
