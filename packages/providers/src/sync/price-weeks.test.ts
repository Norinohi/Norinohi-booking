import { describe, expect, it } from "vitest";

import { priceWeeksSource, saturdayWeeks } from "../shared/price-weeks";
import type { SweepPeriod } from "../shared/sweep-periods";
import type { JsonValue } from "../shared/json";
import type {
  AvailabilitySyncStore,
  ConfirmSlotInput,
  ConfirmedOfferPage,
  RefusedPeriodWrite,
} from "./availability-writer";
import { SyncAlreadyRunningError } from "./run";
import { openWhenFree, runPriceWeeks, type PriceWeekReport } from "./price-weeks";

const MINUTE = 60_000;
const START = Date.parse("2026-09-17T22:15:00.000Z");

/** What the writer did with the pages, which is all the budget and resume logic can change. */
function recordingStore() {
  const cursors: (JsonValue | null)[] = [];
  const confirmed: ConfirmSlotInput[] = [];
  const refusals: RefusedPeriodWrite[] = [];
  const rebuilt: string[][] = [];

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
    confirmSlots: (inputs) => {
      confirmed.push(...inputs);
      return Promise.resolve(inputs.map((input) => input.listingId));
    },
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
    rebuildSearch: (listingIds) => {
      rebuilt.push(listingIds);
      return Promise.resolve();
    },
  };

  return { store, cursors, confirmed, refusals, rebuilt };
}

/** A vendor that prices one hull per week and takes `minutesPerWeek` of the clock to answer. */
function slowVendor(minutesPerWeek: number) {
  let elapsed = 0;
  const asked: string[] = [];
  const now = () => new Date(START + elapsed);

  const stream = async function* (pending: readonly SweepPeriod[]) {
    for (const week of pending) {
      asked.push(week.startDate);
      elapsed += minutesPerWeek * MINUTE;
      const confirmedPage: ConfirmedOfferPage = {
        offers: [
          {
            externalYachtId: "4711001",
            startDate: week.startDate,
            endDate: week.endDate,
            priceMinor: 350_000,
            currency: "EUR",
            sourceHash: `hash_${week.startDate}`,
          },
        ],
        cursor: null,
        swept: { startDate: week.startDate, endDate: week.endDate, scopeKeys: null },
      };
      yield confirmedPage;
    }
  };

  return { stream, now, asked };
}

const weeks = saturdayWeeks({ today: "2026-09-17", leadDays: 1, count: 6 });

describe("runPriceWeeks", () => {
  it("stops at the budget and leaves the first unfinished week as the cursor", async () => {
    const vendor = slowVendor(20);
    const { store, cursors } = recordingStore();

    const summary = await runPriceWeeks({
      store,
      source: priceWeeksSource({ weeks, stream: vendor.stream }),
      weeks,
      resume: null,
      budgetMs: 45 * MINUTE,
      now: vendor.now,
    });

    expect(summary.budgetExhausted).toBe(true);
    expect(vendor.asked).toEqual(["2026-09-19", "2026-09-26", "2026-10-03"]);
    expect(cursors.at(-1)).toEqual({ nextCheckIn: "2026-10-10" });
  });

  it("continues the next night from where the budget stopped it, then clears the cursor", async () => {
    const vendor = slowVendor(20);
    const { store, cursors } = recordingStore();

    const summary = await runPriceWeeks({
      store,
      source: priceWeeksSource({ weeks, stream: vendor.stream }),
      weeks,
      resume: { nextCheckIn: "2026-10-10" },
      budgetMs: 90 * MINUTE,
      now: vendor.now,
    });

    expect(summary.budgetExhausted).toBe(false);
    expect(vendor.asked).toEqual(["2026-10-10", "2026-10-17", "2026-10-24"]);
    /* A finished cycle clears the cursor, so the night after starts from the front again. */
    expect(cursors.at(-1)).toBeNull();
  });

  it("writes prices and refusals through the writer and rebuilds what it priced", async () => {
    const vendor = slowVendor(1);
    const { store, confirmed, refusals, rebuilt } = recordingStore();

    const summary = await runPriceWeeks({
      store,
      source: priceWeeksSource({ weeks: weeks.slice(0, 2), stream: vendor.stream }),
      weeks: weeks.slice(0, 2),
      resume: null,
      budgetMs: 45 * MINUTE,
      now: vendor.now,
    });

    expect(summary.confirmedSlots).toBe(2);
    expect(summary.occupiedSlots).toBe(0);
    expect(confirmed.map((slot) => slot.startDate)).toEqual(["2026-09-19", "2026-09-26"]);
    expect(refusals.map((write) => write.offeredListingIds)).toEqual([
      ["lst_4711001"],
      ["lst_4711001"],
    ]);
    expect(rebuilt).toEqual([["lst_4711001"]]);
  });

  it("reports each week it priced, with its vendor and writer time", async () => {
    const vendor = slowVendor(3);
    const { store } = recordingStore();
    const reports: PriceWeekReport[] = [];

    await runPriceWeeks({
      store,
      source: priceWeeksSource({ weeks, stream: vendor.stream }),
      weeks,
      resume: { nextCheckIn: "2026-10-24" },
      budgetMs: 45 * MINUTE,
      now: vendor.now,
      onWeek: (report) => reports.push(report),
    });

    expect(reports).toEqual([
      {
        startDate: "2026-10-24",
        endDate: "2026-10-31",
        offers: 1,
        fetchMs: 3 * MINUTE,
        writeMs: 0,
      },
    ]);
  });
});

describe("openWhenFree", () => {
  function fakeClock() {
    let at = START;
    return {
      now: () => at,
      sleep: (ms: number) => {
        at += ms;
        return Promise.resolve();
      },
    };
  }

  it("waits out an availability run that holds the lock, then opens", async () => {
    const clock = fakeClock();
    let attempts = 0;

    const id = await openWhenFree(
      () => {
        attempts += 1;
        return attempts < 3
          ? Promise.reject(new SyncAlreadyRunningError("prv_nausys", "availability"))
          : Promise.resolve("sync_opened");
      },
      { until: START + 20 * MINUTE, pollMs: 30_000, ...clock },
    );

    expect(id).toBe("sync_opened");
    expect(attempts).toBe(3);
  });

  it("gives up once the wait would pass its limit", async () => {
    const clock = fakeClock();

    await expect(
      openWhenFree(
        () => Promise.reject(new SyncAlreadyRunningError("prv_nausys", "availability")),
        { until: START + 2 * MINUTE, pollMs: 30_000, ...clock },
      ),
    ).rejects.toBeInstanceOf(SyncAlreadyRunningError);
    expect(clock.now()).toBeLessThanOrEqual(START + 2 * MINUTE);
  });

  it("does not wait on a failure that is not the lock", async () => {
    const clock = fakeClock();

    await expect(
      openWhenFree(() => Promise.reject(new Error("connection refused")), {
        until: START + 20 * MINUTE,
        pollMs: 30_000,
        ...clock,
      }),
    ).rejects.toThrow("connection refused");
    expect(clock.now()).toBe(START);
  });
});
