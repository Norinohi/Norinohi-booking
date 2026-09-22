import type { InventoryProvider, PriceWeeksProvider } from "../provider";
import type { Database } from "../registry";
import { remainingWeeks } from "../shared/price-weeks";
import type { JsonValue } from "../shared/json";
import type { SweepPeriod } from "../shared/sweep-periods";
import {
  type AvailabilitySource,
  type AvailabilitySyncStore,
  type AvailabilitySyncSummary,
  createDrizzleAvailabilitySyncStore,
  openAvailabilitySyncRun,
  runAvailabilitySync,
} from "./availability-writer";
import { readSyncCursor } from "./cursor";
import { type LockWait, openWhenFree } from "./run";

/**
 * Its own cursor row beside the half-hourly sweep's `occupancy:hot`, under the same kind.
 *
 * The same kind because it is the same lock. `sync_run_in_flight_uq` is the only thing that
 * stops two processes calling one vendor at once, NauSYS forbids parallel calls on a credential,
 * and both passes write the same slots and refusals. A kind of its own would have let this run
 * and the sweep interleave on every night it overlapped a tick.
 */
export const PRICE_WEEKS_CURSOR_SCOPE = "price-weeks";

export function readPriceWeeksCursor(db: Database, providerId: string) {
  return readSyncCursor(db, {
    providerId,
    kind: "availability",
    scope: PRICE_WEEKS_CURSOR_SCOPE,
  });
}

export function openPriceWeeksRun(db: Database, providerId: string, wait: LockWait) {
  return openWhenFree(() => openAvailabilitySyncRun(db, providerId), wait);
}

export interface PriceWeekReport {
  startDate: string;
  endDate: string;
  offers: number;
  /** From asking the stream for the week to the page arriving: the vendor's share. */
  fetchMs: number;
  /** From handing the page over to being asked for the next: the writer's share. */
  writeMs: number;
}

export interface PriceWeeksRunOptions {
  store: AvailabilitySyncStore;
  source: AvailabilitySource;
  weeks: readonly SweepPeriod[];
  resume: JsonValue;
  budgetMs: number;
  now?: () => Date;
  onWeek?: (report: PriceWeekReport) => void;
}

/**
 * The confirming pass over the horizon's weeks, stopped by the writer's own budget check.
 *
 * The writer tests the clock after each page, so a run overruns its budget by at most one week
 * plus the closing rebuild, and the cursor it saved names the first week it did not finish.
 */
export function runPriceWeeks(options: PriceWeeksRunOptions): Promise<AvailabilitySyncSummary> {
  const clock = options.now ?? (() => new Date());
  const source = options.onWeek
    ? timedSource(
        options.source,
        remainingWeeks(options.weeks, options.resume),
        clock,
        options.onWeek,
      )
    : options.source;

  return runAvailabilitySync({
    store: options.store,
    source,
    hotWindowBudgetMs: options.budgetMs,
    now: clock,
    resume: options.resume,
  });
}

/*
 * Counts pages against the same remainder the source resumes into, which is sound because the
 * source yields exactly one page per week in order and fails loudly otherwise.
 */
function timedSource(
  source: AvailabilitySource,
  pending: readonly SweepPeriod[],
  clock: () => Date,
  onWeek: (report: PriceWeekReport) => void,
): AvailabilitySource {
  const inner = source.searchConfirmed;
  if (!inner) return source;

  return {
    ...source,
    async *searchConfirmed(resume) {
      let index = 0;
      let askedAt = clock().getTime();
      for await (const page of inner.call(source, resume)) {
        const arrivedAt = clock().getTime();
        yield page;
        const writtenAt = clock().getTime();
        const week = pending[index];
        index += 1;
        if (week) {
          onWeek({
            startDate: week.startDate,
            endDate: week.endDate,
            offers: page.offers.length,
            fetchMs: arrivedAt - askedAt,
            writeMs: writtenAt - arrivedAt,
          });
        }
        askedAt = writtenAt;
      }
    },
  };
}

export interface PriceWeeksJobOptions {
  db: Database;
  provider: InventoryProvider & PriceWeeksProvider;
  providerId: string;
  syncRunId: string;
  weeks: readonly SweepPeriod[];
  resume: JsonValue;
  budgetMs: number;
  onWeek?: (report: PriceWeekReport) => void;
}

export function runPriceWeeksJob(options: PriceWeeksJobOptions): Promise<AvailabilitySyncSummary> {
  return runPriceWeeks({
    store: createDrizzleAvailabilitySyncStore({
      db: options.db,
      providerId: options.providerId,
      syncRunId: options.syncRunId,
      cursorScope: PRICE_WEEKS_CURSOR_SCOPE,
    }),
    source: options.provider.createPriceWeeksSource(options.weeks),
    weeks: options.weeks,
    resume: options.resume,
    budgetMs: options.budgetMs,
    ...(options.onWeek ? { onWeek: options.onWeek } : null),
  });
}
