import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import { createConcurrencyGovernor } from "../shared/concurrency-governor";
import { RateLimitedError, TransientError } from "../shared/errors";
import { priceWeeksCursorSchema, priceWeeksSource, saturdayWeeks } from "../shared/price-weeks";
import type { JsonValue } from "../shared/json";
import type { SweepPeriod } from "../shared/sweep-periods";
import type { AvailabilitySyncStore, RefusedPeriodWrite } from "../sync/availability-writer";
import { runPriceWeeks } from "../sync/price-weeks";
import type { BookingManagerClient } from "./client";
import { type BookingManagerConfig, resolveBookingManagerConfig } from "./config";
import { streamBookingManagerConfirmedOffers } from "./confirmed-offers";
import type { RestOffer } from "./endpoints";

const MINUTE = 60_000;
const START = Date.parse("2026-09-17T22:15:00.000Z");
const TODAY = "2026-09-17";

const config: BookingManagerConfig = resolveBookingManagerConfig({
  BOOKING_MANAGER_BASE_URL: "https://www.booking-manager.com/api/v2",
  BOOKING_MANAGER_API_KEY: "t0ken",
  BOOKING_MANAGER_TIMEOUT_MS: 30_000,
  BOOKING_MANAGER_SYNC_TIMEOUT_MS: 180_000,
  BOOKING_MANAGER_MIN_INTERVAL_MS: 0,
  BOOKING_MANAGER_SWEEP_CONCURRENCY: 12,
  BOOKING_MANAGER_PRICE_WEEKS_CONCURRENCY: 4,
  BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES: 15,
  BOOKING_MANAGER_TIMEZONE: "Europe/Zagreb",
});

const weeks = saturdayWeeks({ today: TODAY, leadDays: 1, count: 6 });

type Query = { dateFrom?: unknown; dateTo?: unknown };

interface VendorOptions {
  /** How long each week's answer takes, by check-in, in minutes of the fake clock. */
  minutesFor?: (checkIn: string) => number;
  /** A throw to answer a check-in with, once, instead of offers. */
  failOnce?: { checkIn: string; error: Error };
}

/**
 * A Booking Manager the test drives: it records overlap, answers out of order on request, and
 * moves a clock the budget check reads, so what the pass does with a fan-out is observable
 * without a network or real timers.
 */
function fakeVendor(options: VendorOptions = {}) {
  const asked: string[] = [];
  const failed = new Set<string>();
  let elapsed = 0;
  let inFlight = 0;
  let peak = 0;

  // SAFETY: a stub with nothing behind it; any method these paths do not use is absent, so
  // reaching for one is a TypeError rather than a wrong answer.
  const client = Object.assign({} as BookingManagerClient, {
    sweepLane: () => ({}),
    get: async (
      _endpoint: string,
      _schema: z.ZodType<RestOffer[]>,
      query?: Query,
    ): Promise<RestOffer[]> => {
      const checkIn = String(query?.dateFrom).slice(0, 10);
      asked.push(checkIn);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      try {
        /* Yields the event loop so the window really is filled, not merely asked to fill. */
        await new Promise((resolve) => setTimeout(resolve, 0));
        elapsed += (options.minutesFor?.(checkIn) ?? 1) * MINUTE;
        const failure = options.failOnce;
        if (failure && failure.checkIn === checkIn && !failed.has(checkIn)) {
          failed.add(checkIn);
          throw failure.error;
        }
        return [];
      } finally {
        inFlight -= 1;
      }
    },
  });

  return { client, asked, now: () => new Date(START + elapsed), peak: () => peak };
}

/** The check-in a saved cursor names, read the same way the source itself reads one back. */
function checkInOf(cursor: JsonValue | null): string {
  const parsed = priceWeeksCursorSchema.safeParse(cursor);
  if (!parsed.success) throw new Error(`not a price-weeks cursor: ${JSON.stringify(cursor)}`);
  return parsed.data.nextCheckIn;
}

/** The writer's side effects, which is all the ordering guarantees can be read from. */
function recordingStore() {
  const cursors: (JsonValue | null)[] = [];
  const refusals: RefusedPeriodWrite[] = [];

  const store: AvailabilitySyncStore = {
    syncRunId: "sync_price_weeks",
    startRun: () => Promise.resolve(),
    resolveListing: (externalYachtId) =>
      Promise.resolve({
        listingId: `lst_${externalYachtId}`,
        listingSourceId: `ls_${externalYachtId}`,
        listingOfferId: `lo_${externalYachtId}`,
      }),
    listListingsForScope: () => Promise.resolve([]),
    writeSlots: () => Promise.resolve(),
    writeFreePeriods: () => Promise.resolve(),
    confirmSlots: (inputs) => Promise.resolve(inputs.map((input) => input.listingId)),
    replaceRefusedPeriods: (input) => {
      refusals.push(input);
      return Promise.resolve(0);
    },
    sweepScope: () => Promise.resolve(0),
    recordError: () => Promise.resolve(),
    saveCursor: (cursor) => {
      cursors.push(JSON.parse(JSON.stringify(cursor)));
      return Promise.resolve();
    },
    closeRun: () => Promise.resolve(),
    rebuildSearch: () => Promise.resolve(),
  };

  return { store, cursors, refusals };
}

function sourceFor(
  vendor: ReturnType<typeof fakeVendor>,
  concurrency: ReturnType<typeof createConcurrencyGovernor>,
  rateLimit?: Parameters<typeof priceWeeksSource>[0]["rateLimit"],
) {
  return priceWeeksSource({
    weeks,
    ...(rateLimit ? { rateLimit } : null),
    stream: (pending: readonly SweepPeriod[]) =>
      streamBookingManagerConfirmedOffers(
        {
          client: vendor.client,
          config,
          companyIds: [],
          years: [2026],
          weeks: pending,
          today: TODAY,
          concurrency,
        },
        { weekIndex: 0 },
      ),
  });
}

describe("the Booking Manager price-weeks pass with several periods in flight", () => {
  it("asks about several weeks at once and never more than the governor allows", async () => {
    const vendor = fakeVendor();
    const { store } = recordingStore();

    await runPriceWeeks({
      store,
      source: sourceFor(vendor, createConcurrencyGovernor({ start: 3 })),
      weeks,
      resume: null,
      budgetMs: 45 * MINUTE,
      now: vendor.now,
    });

    expect(vendor.peak()).toBe(3);
    expect(vendor.asked).toHaveLength(weeks.length);
  });

  it("advances the cursor in week order however the vendor answers", async () => {
    /* The later weeks answer instantly and the first one drags, which is the order a cursor
       written on arrival rather than in sequence would get wrong. */
    const vendor = fakeVendor({
      minutesFor: (checkIn) => (checkIn === weeks[0]?.startDate ? 5 : 0),
    });
    const { store, cursors } = recordingStore();

    await runPriceWeeks({
      store,
      source: sourceFor(vendor, createConcurrencyGovernor({ start: 4 })),
      weeks,
      resume: null,
      budgetMs: 45 * MINUTE,
      now: vendor.now,
    });

    const checkIns = cursors.slice(0, -1).map(checkInOf);
    /* One per week: each names the next one, and the last names the week after the horizon. */
    expect(checkIns).toEqual([...weeks.slice(1).map((week) => week.startDate), "2026-10-31"]);
    /* The walk finished, so the cursor is cleared and the next night starts from the front. */
    expect(cursors.at(-1)).toBeNull();
  });

  it("leaves no gap behind when the budget stops a run with weeks still in flight", async () => {
    const vendor = fakeVendor({ minutesFor: () => 20 });
    const { store, cursors, refusals } = recordingStore();

    const summary = await runPriceWeeks({
      store,
      source: sourceFor(vendor, createConcurrencyGovernor({ start: 4 })),
      weeks,
      resume: null,
      budgetMs: 45 * MINUTE,
      now: vendor.now,
    });

    expect(summary.budgetExhausted).toBe(true);
    const cursor = checkInOf(cursors.at(-1) ?? null);
    /* Whatever the fan-out fetched, the run committed a prefix: every week before the cursor
       was written and none after it, so the next night resumes into no hole. */
    const written = refusals.map((refusal) => refusal.period.startDate);
    const upTo = weeks.findIndex((week) => week.startDate === cursor);
    expect(upTo).toBeGreaterThan(0);
    expect(written).toEqual(weeks.slice(0, upTo).map((week) => week.startDate));
  });

  it("keeps the weeks that answered when one period fails, and stops the cursor at it", async () => {
    const failing = weeks[2]?.startDate ?? "";
    const vendor = fakeVendor({
      failOnce: { checkIn: failing, error: new TransientError("Provider returned HTTP 500") },
    });
    const { store, cursors, refusals } = recordingStore();

    const summary = await runPriceWeeks({
      store,
      source: sourceFor(vendor, createConcurrencyGovernor({ start: 4 })),
      weeks,
      resume: null,
      budgetMs: 45 * MINUTE,
      now: vendor.now,
    });

    /* Partial, not failed: the weeks that answered are written and kept. */
    expect(summary.status).toBe("partial");
    expect(refusals.map((refusal) => refusal.period.startDate)).toEqual([
      weeks[0]?.startDate,
      weeks[1]?.startDate,
    ]);
    expect(cursors.at(-1)).toEqual({ nextCheckIn: failing });
  });

  it("narrows the fan-out for the rest of the run once the vendor answers 429", async () => {
    const refused = weeks[0]?.startDate ?? "";
    const vendor = fakeVendor({
      failOnce: { checkIn: refused, error: new RateLimitedError("HTTP 429") },
    });
    const narrowed: number[] = [];
    const { store } = recordingStore();
    const concurrency = createConcurrencyGovernor({
      start: 4,
      onBackOff: (limit) => narrowed.push(limit),
    });

    const paused: number[] = [];
    await runPriceWeeks({
      store,
      source: sourceFor(vendor, concurrency, {
        pauseMs: 0,
        maxPauses: 3,
        sleep: () => Promise.resolve(),
        onPause: (pause) => paused.push(pause),
      }),
      weeks,
      resume: null,
      budgetMs: 45 * MINUTE,
      now: vendor.now,
    });

    expect(narrowed).toEqual([2]);
    expect(paused).toEqual([1]);
    expect(concurrency.limit()).toBe(2);
    /* The restart re-asks only the week that was refused, so nothing was written twice. */
    expect(vendor.asked.filter((checkIn) => checkIn === refused)).toHaveLength(2);
  });
});
