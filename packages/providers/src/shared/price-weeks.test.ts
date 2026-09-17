import { describe, expect, it } from "vitest";

import { unscopedCompanies } from "./company-scope";
import { RateLimitedError } from "./errors";
import { SequentialQueue } from "./queue";
import type { ConfirmedOfferPage } from "../sync/availability-writer";
import { NausysClient } from "../nausys/client";
import type { NausysConfig } from "../nausys/config";
import { streamNausysConfirmedOffers } from "../nausys/confirmed-offers";
import { FakeNausysTransport } from "../nausys/testing/fake-transport";
import { leadDaysFor, priceWeeksSource, remainingWeeks, saturdayWeeks } from "./price-weeks";
import type { SweepPeriod } from "./sweep-periods";

describe("saturdayWeeks", () => {
  it("names Saturday-to-Saturday weeks, one after another", () => {
    const weeks = saturdayWeeks({ today: "2026-09-14", leadDays: 1, count: 3 });

    expect(weeks.map(({ startDate, endDate }) => [startDate, endDate])).toEqual([
      ["2026-09-19", "2026-09-26"],
      ["2026-09-26", "2026-10-03"],
      ["2026-10-03", "2026-10-10"],
    ]);
    for (const week of weeks) expect(new Date(`${week.startDate}T00:00:00Z`).getUTCDay()).toBe(6);
  });

  it("starts at the first Saturday outside the lead time", () => {
    /* Thursday: one day of notice reaches Friday, so this Saturday is still sellable. */
    expect(saturdayWeeks({ today: "2026-09-17", leadDays: 1, count: 1 })[0]?.startDate).toBe(
      "2026-09-19",
    );
    /* Two days of notice lands on the Saturday itself, which is the earliest check-in allowed. */
    expect(saturdayWeeks({ today: "2026-09-17", leadDays: 2, count: 1 })[0]?.startDate).toBe(
      "2026-09-19",
    );
    /* Friday with two days of notice: Saturday is too soon, so the horizon opens a week later. */
    expect(saturdayWeeks({ today: "2026-09-18", leadDays: 2, count: 1 })[0]?.startDate).toBe(
      "2026-09-26",
    );
  });

  it("covers exactly the horizon it is given", () => {
    const weeks = saturdayWeeks({ today: "2026-09-17", leadDays: 1, count: 26 });

    expect(weeks).toHaveLength(26);
    expect(weeks.at(-1)).toMatchObject({ startDate: "2027-03-13", endDate: "2027-03-20" });
  });

  it("judges silence on every week, since each is asked for the whole fleet", () => {
    for (const week of saturdayWeeks({ today: "2026-09-17", leadDays: 1, count: 4 })) {
      expect(week).not.toHaveProperty("judgesSilence");
      expect(week).not.toHaveProperty("yachtIds");
    }
  });

  it("takes each vendor's own notice, never less than the shared floor", () => {
    expect(leadDaysFor("booking_manager")).toBe(2);
    expect(leadDaysFor("nausys")).toBe(1);
  });
});

describe("remainingWeeks", () => {
  const weeks = saturdayWeeks({ today: "2026-09-17", leadDays: 1, count: 4 });

  it("walks the whole horizon with no cursor", () => {
    expect(remainingWeeks(weeks, null)).toEqual(weeks);
  });

  it("resumes at the week the cursor names", () => {
    expect(remainingWeeks(weeks, { nextCheckIn: "2026-10-03" })[0]?.startDate).toBe("2026-10-03");
  });

  /* The list is rebuilt from the next night's today, so an index would drift; a date cannot. */
  it("still resumes at the right week after the horizon has moved on", () => {
    const nextWeek = saturdayWeeks({ today: "2026-09-24", leadDays: 1, count: 4 });

    expect(remainingWeeks(nextWeek, { nextCheckIn: "2026-10-03" })[0]?.startDate).toBe(
      "2026-10-03",
    );
  });

  it("starts the cycle over from a cursor past the horizon or one it cannot read", () => {
    expect(remainingWeeks(weeks, { nextCheckIn: "2027-01-02" })).toEqual(weeks);
    expect(remainingWeeks(weeks, { windowIndex: 3 })).toEqual(weeks);
  });
});

function page(week: SweepPeriod): ConfirmedOfferPage {
  return {
    offers: [],
    cursor: { windowIndex: 99 },
    swept: { startDate: week.startDate, endDate: week.endDate, scopeKeys: null },
  };
}

async function collect(pages: AsyncIterable<ConfirmedOfferPage> | undefined) {
  const collected: ConfirmedOfferPage[] = [];
  for await (const next of pages ?? []) collected.push(next);
  return collected;
}

describe("priceWeeksSource", () => {
  const weeks = saturdayWeeks({ today: "2026-09-17", leadDays: 1, count: 3 });

  it("walks no occupancy, so the writer goes straight to confirming", async () => {
    const source = priceWeeksSource({ weeks, stream: async function* () {} });

    await expect(source.listScopes()).resolves.toEqual([]);
  });

  it("replaces the stream's own cursor with the next week's check-in", async () => {
    const source = priceWeeksSource({
      weeks,
      stream: async function* (pending) {
        for (const week of pending) yield page(week);
      },
    });

    const pages = await collect(source.searchConfirmed?.(null));

    expect(pages.map((next) => next.cursor)).toEqual([
      { nextCheckIn: "2026-09-26" },
      { nextCheckIn: "2026-10-03" },
      { nextCheckIn: "2026-10-10" },
    ]);
  });

  it("hands the stream only the weeks a resumed run has not priced", async () => {
    const asked: string[] = [];
    const source = priceWeeksSource({
      weeks,
      stream: async function* (pending) {
        for (const week of pending) {
          asked.push(week.startDate);
          yield page(week);
        }
      },
    });

    await collect(source.searchConfirmed?.({ nextCheckIn: "2026-09-26" }));

    expect(asked).toEqual(["2026-09-26", "2026-10-03"]);
  });

  it("fails rather than mislabel a cursor when the stream yields more pages than weeks", async () => {
    const source = priceWeeksSource({
      weeks: weeks.slice(0, 1),
      stream: async function* (pending) {
        for (const week of [...pending, ...pending]) yield page(week);
      },
    });

    await expect(collect(source.searchConfirmed?.(null))).rejects.toThrow(/more pages/);
  });
});

describe("priceWeeksSource under a vendor rate limit", () => {
  const weeks = saturdayWeeks({ today: "2026-09-17", leadDays: 1, count: 3 });

  /* Answers the first week, then refuses `refusals` times before answering again. */
  function throttledVendor(refusals: number) {
    const asked: string[] = [];
    let remaining = refusals;
    const stream = async function* (pending: readonly SweepPeriod[]) {
      for (const week of pending) {
        asked.push(week.startDate);
        if (week.startDate === "2026-09-26" && remaining > 0) {
          remaining -= 1;
          throw new RateLimitedError("Provider rate limited the request (HTTP 429)");
        }
        yield page(week);
      }
    };
    return { stream, asked };
  }

  function pause(maxPauses: number) {
    const slept: number[] = [];
    return {
      slept,
      rateLimit: {
        pauseMs: 120_000,
        maxPauses,
        sleep: (ms: number) => {
          slept.push(ms);
          return Promise.resolve();
        },
      },
    };
  }

  it("waits and restarts at the week that was refused, asking nothing twice", async () => {
    const vendor = throttledVendor(2);
    const { slept, rateLimit } = pause(5);
    const source = priceWeeksSource({ weeks, stream: vendor.stream, rateLimit });

    const pages = await collect(source.searchConfirmed?.(null));

    expect(pages.map((next) => next.swept?.startDate)).toEqual([
      "2026-09-19",
      "2026-09-26",
      "2026-10-03",
    ]);
    expect(vendor.asked).toEqual([
      "2026-09-19",
      "2026-09-26",
      "2026-09-26",
      "2026-09-26",
      "2026-10-03",
    ]);
    expect(slept).toEqual([120_000, 120_000]);
  });

  it("gives the night up once the pauses run out, so the cursor keeps the refused week", async () => {
    const vendor = throttledVendor(10);
    const { rateLimit } = pause(2);
    const source = priceWeeksSource({ weeks, stream: vendor.stream, rateLimit });
    const pages: ConfirmedOfferPage[] = [];

    await expect(
      (async () => {
        for await (const next of source.searchConfirmed?.(null) ?? []) pages.push(next);
      })(),
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(pages.map((next) => next.cursor)).toEqual([{ nextCheckIn: "2026-09-26" }]);
  });

  it("does not wait on a failure that is not a rate limit", async () => {
    const { slept, rateLimit } = pause(5);
    const source = priceWeeksSource({
      weeks,
      stream: async function* () {
        yield* [];
        throw new Error("socket hang up");
      },
      rateLimit,
    });

    await expect(collect(source.searchConfirmed?.(null))).rejects.toThrow("socket hang up");
    expect(slept).toEqual([]);
  });
});

const nausysConfig: NausysConfig = {
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

/* The source over the real NauSYS stream, as `NausysInventoryProvider.createPriceWeeksSource` wires it. */
describe("price weeks through the NauSYS confirming stream", () => {
  function nausysWeeks(resume: { nextCheckIn: string } | null) {
    const transport = new FakeNausysTransport();
    transport.respondWith("freeYachts", { status: "OK", freeYachts: [] });
    const client = new NausysClient({
      config: nausysConfig,
      fetchImpl: transport.fetch,
      queue: new SequentialQueue(),
      retry: { maxAttempts: 1 },
      lane: "sync",
    });

    const source = priceWeeksSource({
      weeks: saturdayWeeks({ today: "2026-09-17", leadDays: 1, count: 2 }),
      stream: (pending) =>
        streamNausysConfirmedOffers(
          {
            client,
            periods: { advertised: [], grid: pending },
            loadYachtIds: () => Promise.resolve(["4711001", "4711002", "4711003"]),
            companyIds: ["102701"],
            chunkSize: 2,
          },
          { windowIndex: 0 },
        ),
    });

    return { transport, pages: collect(source.searchConfirmed?.(resume)) };
  }

  it("asks the whole fleet about every week, batch by batch", async () => {
    const { transport, pages } = nausysWeeks(null);
    await pages;

    expect(transport.calls.map((call) => call.body)).toMatchObject([
      { periodFrom: "19.09.2026", periodTo: "26.09.2026", yachts: [4_711_001, 4_711_002] },
      { periodFrom: "19.09.2026", periodTo: "26.09.2026", yachts: [4_711_003] },
      { periodFrom: "26.09.2026", periodTo: "03.10.2026", yachts: [4_711_001, 4_711_002] },
      { periodFrom: "26.09.2026", periodTo: "03.10.2026", yachts: [4_711_003] },
    ]);
    expect(transport.maxConcurrent).toBe(1);
  });

  it("reports each week as swept across the companies asked, judging the whole fleet", async () => {
    const { pages } = nausysWeeks(null);

    expect((await pages).map((next) => next.swept)).toEqual([
      {
        startDate: "2026-09-19",
        endDate: "2026-09-26",
        scopeKeys: ["102701"],
        externalYachtIds: null,
      },
      {
        startDate: "2026-09-26",
        endDate: "2026-10-03",
        scopeKeys: ["102701"],
        externalYachtIds: null,
      },
    ]);
  });

  it("asks nothing about a week a previous night already priced", async () => {
    const { transport, pages } = nausysWeeks({ nextCheckIn: "2026-09-26" });
    await pages;

    expect(transport.calls.map((call) => call.body.periodFrom)).toEqual([
      "26.09.2026",
      "26.09.2026",
    ]);
  });
});
