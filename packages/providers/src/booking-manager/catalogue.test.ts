import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import type { QueryValue } from "../shared/http-client";
import type { CatalogueSyncEvent } from "../sync/runner";
import type { BookingManagerClient } from "./client";
import {
  type BookingManagerCatalogueCursor,
  parseBookingManagerCatalogueCursor,
  resumeCompanyIndex,
  syncBookingManagerCatalogue,
} from "./catalogue";
import { bookingManagerEndpoints } from "./endpoints";

/*
 * The yacht sweep resumes by position in a company list, and the list is rebuilt on
 * every run. Narrowing the scope shrinks 1308 entries to one, at which point an old
 * index addresses nothing - and the failure is silent: the run sweeps zero yachts,
 * writes zero prices, reports success, and still retires every company it excluded.
 * That happened on production on 2026-08-19.
 */
describe("resumeCompanyIndex", () => {
  const cursor = (
    companyIndex: number,
    companyId?: string,
    step = 8,
  ): BookingManagerCatalogueCursor => ({ step, companyIndex, companyId });

  const fleet = ["101", "202", "303", "404"];

  it("resumes where it left off when the company is still at that index", () => {
    expect(resumeCompanyIndex(cursor(2, "303"), fleet)).toBe(2);
  });

  it("restarts when the scope narrowed under a cursor from a wider run", () => {
    // The production case: a cursor from a 1308-company walk against a list of one.
    expect(resumeCompanyIndex(cursor(600, "888"), ["225"])).toBe(0);
  });

  it("restarts when the list shifted and the index now names another company", () => {
    expect(resumeCompanyIndex(cursor(2, "303"), ["101", "999", "303", "404"])).toBe(2);
    expect(resumeCompanyIndex(cursor(2, "303"), ["999", "101", "202", "303"])).toBe(0);
  });

  it("does not trust a cursor written before the company id was recorded", () => {
    expect(resumeCompanyIndex(cursor(2, undefined), fleet)).toBe(0);
  });

  it("starts from the beginning when the cursor is not in the yacht step", () => {
    expect(resumeCompanyIndex(cursor(2, "303", 3), fleet)).toBe(0);
    expect(resumeCompanyIndex(null, fleet)).toBe(0);
  });

  it("starts from the beginning for a cursor pointing past the end", () => {
    expect(resumeCompanyIndex(cursor(9, "303"), fleet)).toBe(0);
  });
});

describe("parseBookingManagerCatalogueCursor", () => {
  it("keeps the company id when present", () => {
    expect(
      parseBookingManagerCatalogueCursor({ step: 8, companyIndex: 3, companyId: "404" }),
    ).toEqual({ step: 8, companyIndex: 3, companyId: "404" });
  });

  it("still reads a cursor written before the company id existed", () => {
    expect(parseBookingManagerCatalogueCursor({ step: 8, companyIndex: 3 })).toEqual({
      step: 8,
      companyIndex: 3,
    });
  });

  it("rejects a cursor it cannot read rather than guessing a position", () => {
    expect(parseBookingManagerCatalogueCursor({ step: -1 })).toBeNull();
    expect(parseBookingManagerCatalogueCursor("nonsense")).toBeNull();
  });
});

type CatalogueQuery = Record<string, QueryValue | undefined>;

/**
 * Answers the reference dumps with nothing and the fleet with one boat per
 * company, so a test can watch the yacht sweep alone.
 */
function fakeClient(
  companyIds: readonly string[],
  yachts: (companyId: string) => Promise<unknown[]>,
  sweepConcurrency = 4,
): BookingManagerClient {
  // SAFETY: a stub with nothing behind it; a method the stream does not use is
  // absent, so reaching for one is a TypeError rather than a wrong answer.
  return Object.assign({} as BookingManagerClient, {
    config: { sweepConcurrency, queueKey: "booking_manager:test" },
    sweepLane: (name: string, slot: number) => ({ queueKey: `${name}#${slot}` }),
    get: (endpoint: string, _schema: z.ZodType<unknown>, query: CatalogueQuery = {}) => {
      if (endpoint === bookingManagerEndpoints.companies) {
        return Promise.resolve(companyIds.map((id) => ({ id })));
      }
      if (endpoint === bookingManagerEndpoints.yachts) {
        return yachts(String(query.companyId));
      }
      return Promise.resolve([]);
    },
  });
}

async function collect(stream: AsyncIterable<CatalogueSyncEvent>): Promise<CatalogueSyncEvent[]> {
  const events: CatalogueSyncEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

/*
 * `/yachts` is one read per operator and a production credential has ~1300 of them,
 * so the sweep overlaps them. What must survive that is the order: the resume cursor
 * is a position in the company list, and a cursor saved for company 40 while 37 was
 * still in flight tells the next run that 37 landed.
 */
describe("syncBookingManagerCatalogue yacht sweep", () => {
  const companyIds = ["1", "2", "3", "4", "5"];

  it("runs several companies at once without exceeding the width", async () => {
    let inFlight = 0;
    let peak = 0;

    const client = fakeClient(
      companyIds,
      async (companyId) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await Promise.resolve();
        inFlight -= 1;
        return [{ id: `y${companyId}` }];
      },
      3,
    );

    await collect(syncBookingManagerCatalogue(client));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it("emits every company in list order however the reads finish", async () => {
    // Later companies answer sooner: without ordered delivery the cursor would
    // advance past companies still in flight.
    const delayByCompany = new Map(companyIds.map((id, index) => [id, companyIds.length - index]));

    const client = fakeClient(companyIds, async (companyId) => {
      const ticks = delayByCompany.get(companyId) ?? 0;
      for (let tick = 0; tick < ticks; tick += 1) await Promise.resolve();
      return [{ id: `y${companyId}` }];
    });

    const events = await collect(syncBookingManagerCatalogue(client));
    const swept = events.filter(
      (event) => event.type === "scope-complete" && event.resourceType === "yacht",
    );

    expect(swept.map((event) => (event.type === "scope-complete" ? event.scopeKey : null))).toEqual(
      companyIds,
    );
    expect(
      swept.map((event) =>
        event.type === "scope-complete"
          ? parseBookingManagerCatalogueCursor(event.cursor)?.companyIndex
          : null,
      ),
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("reports a failed company against itself and completes the rest", async () => {
    const reported: Array<string | undefined> = [];
    const client = fakeClient(companyIds, (companyId) =>
      companyId === "3"
        ? Promise.reject(new Error("vendor 500"))
        : Promise.resolve([{ id: `y${companyId}` }]),
    );

    const events = await collect(
      syncBookingManagerCatalogue(client, {
        reporter: {
          reportError: (_error, scope) => {
            reported.push(scope?.scopeKey);
            return Promise.resolve();
          },
        },
      }),
    );

    expect(reported).toEqual(["3"]);
    // No scope-complete for the company that failed, so its boats stay active and
    // the cursor never claims to have passed it.
    const swept = events
      .filter((event) => event.type === "scope-complete" && event.resourceType === "yacht")
      .map((event) => (event.type === "scope-complete" ? event.scopeKey : null));
    expect(swept).toEqual(["1", "2", "4", "5"]);
  });

  it("resumes into the yacht step without re-reading the companies it passed", async () => {
    const asked: string[] = [];
    const client = fakeClient(companyIds, (companyId) => {
      asked.push(companyId);
      return Promise.resolve([{ id: `y${companyId}` }]);
    });

    await collect(
      syncBookingManagerCatalogue(client, {
        resume: { step: 8, companyIndex: 3, companyId: "4" },
      }),
    );

    expect(asked).toEqual(["4", "5"]);
  });
});
