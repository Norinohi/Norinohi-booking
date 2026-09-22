import { describe, expect, it } from "vitest";

import { unscopedCompanies } from "../shared/company-scope";
import { SequentialQueue } from "../shared/queue";
import { NausysClient } from "./client";
import type { NausysConfig } from "./config";
import { streamNausysConfirmedOffers } from "./confirmed-offers";
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

describe("the NauSYS price sweep", () => {
  /*
   * Unnamed, the vendor priced per-head obligatory lines for a full boat, and the card showed a
   * couple ten berths' worth of tourist tax the sidebar never charged them.
   */
  it("prices the party the sidebar opens on", async () => {
    const transport = new FakeNausysTransport();
    const client = new NausysClient({
      config,
      fetchImpl: transport.fetch,
      queue: new SequentialQueue(),
      retry: { maxAttempts: 1 },
    });
    transport.respondWith("freeYachts", { status: "OK", freeYachts: [] });

    const pages = streamNausysConfirmedOffers(
      {
        client,
        periods: {
          advertised: [{ startDate: "2026-10-17", endDate: "2026-10-24", source: "advertised" }],
          grid: [],
        },
        loadYachtIds: async () => ["51076474"],
        companyIds: [],
      },
      { windowIndex: 0, page: 1 },
    );
    for await (const page of pages) void page;

    expect(transport.lastBody("freeYachts")).toMatchObject({
      yachts: [51076474],
      numberOfPersons: 2,
    });
  });
});

describe("a hull the sweep cannot read", () => {
  /*
   * One row missing its status failed the whole batch of 250, and advertised weeks are walked
   * first on every run, so it stalled the fleet's prices until the vendor changed the row.
   */
  it("is dropped, and the rest of the batch is priced", async () => {
    const transport = new FakeNausysTransport();
    const client = new NausysClient({
      config,
      fetchImpl: transport.fetch,
      queue: new SequentialQueue(),
      retry: { maxAttempts: 1 },
    });
    const good = {
      yachtId: 51076474,
      periodFrom: "17.10.2026",
      periodTo: "24.10.2026",
      status: "FREE",
      price: { priceListPrice: "19800.00", clientPrice: "17300.00", currency: "EUR" },
    };
    const { status: _status, ...broken } = { ...good, yachtId: 51076475 };
    transport.respondWith("freeYachts", { status: "OK", freeYachts: [broken, good] });

    const offers = [];
    for await (const page of streamNausysConfirmedOffers(
      {
        client,
        periods: {
          advertised: [{ startDate: "2026-10-17", endDate: "2026-10-24", source: "advertised" }],
          grid: [],
        },
        loadYachtIds: async () => ["51076474", "51076475"],
        companyIds: [],
      },
      { windowIndex: 0, page: 1 },
    )) {
      offers.push(...page.offers);
    }

    expect(offers.map((offer) => offer.externalYachtId)).toEqual(["51076474"]);
  });
});
