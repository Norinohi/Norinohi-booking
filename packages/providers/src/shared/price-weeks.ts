import { MIN_LEAD_DAYS, PROVIDER_LEAD_DAYS } from "@yacht-charter/db/search/lead-time";
import { z } from "zod";

import type { ProviderKey } from "../types";
import type { AvailabilitySource, ConfirmedOfferPage } from "../sync/availability-writer";
import { ContractError, RateLimitedError } from "./errors";
import type { JsonField } from "./json";
import type { SweepPeriod } from "./sweep-periods";

/**
 * The nightly pass that prices every Saturday week of the horizon for the whole fleet.
 *
 * The half-hourly sweep asks about what the cards already advertise, which is each listing's
 * nearest bookable charter, so a week three months out is priced only for the handful of boats
 * whose first free week it happens to be. A visitor who searches that week then sees season
 * floors. This pass asks the vendor about every week in turn instead, on a nightly budget, and
 * writes the answers through the same writer.
 */

const SATURDAY = 6;
const DAY_MS = 86_400_000;

function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The notice a vendor needs before check-in, never below the floor the read model applies. */
export function leadDaysFor(key: ProviderKey): number {
  return Math.max(MIN_LEAD_DAYS, PROVIDER_LEAD_DAYS[key] ?? MIN_LEAD_DAYS);
}

export interface PriceWeeksPlan {
  /** Today, as an ISO day. */
  today: string;
  leadDays: number;
  count: number;
}

/**
 * `count` Saturday-to-Saturday weeks, from the first Saturday a charter could still be sold on.
 *
 * Starting inside the lead time would buy answers the read model throws away: it never
 * advertises a check-in earlier than `EARLIEST_CHECKIN`, and Booking Manager refuses those
 * charters anyway, which would be recorded as refusals of a week nobody could book.
 *
 * Every week judges silence. It is asked for the whole fleet in the canonical shape, which is
 * the case the refusal model was built for; see docs/scheduled-jobs.md for the reasoning.
 */
export function saturdayWeeks(plan: PriceWeeksPlan): SweepPeriod[] {
  const earliest = addDays(plan.today, plan.leadDays);
  const weekday = new Date(`${earliest}T00:00:00Z`).getUTCDay();
  const first = addDays(earliest, (SATURDAY - weekday + 7) % 7);

  return Array.from({ length: Math.max(0, plan.count) }, (_, index) => {
    const startDate = addDays(first, index * 7);
    return { startDate, endDate: addDays(startDate, 7), source: "grid" };
  });
}

/**
 * Where a resumed run starts: the check-in of the first week it has not priced.
 *
 * A date rather than an index. The run resumes the next night, and the list is rebuilt from that
 * night's today, so once a Saturday has passed every index would point one week too far.
 */
export const priceWeeksCursorSchema = z.object({
  nextCheckIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type PriceWeeksCursor = z.infer<typeof priceWeeksCursorSchema>;

/**
 * The weeks still to walk. A cursor past the horizon, or one nothing can be read from, starts
 * the cycle again from the front, which is also what a completed walk leaves behind.
 */
export function remainingWeeks(weeks: readonly SweepPeriod[], resume: JsonField): SweepPeriod[] {
  const cursor = priceWeeksCursorSchema.safeParse(resume).data;
  if (!cursor) return [...weeks];

  const pending = weeks.filter((week) => week.startDate >= cursor.nextCheckIn);
  return pending.length > 0 ? pending : [...weeks];
}

export interface PriceWeeksSourceOptions {
  weeks: readonly SweepPeriod[];
  /** The vendor's confirming stream over exactly these weeks, one page per week, in order. */
  stream: (weeks: readonly SweepPeriod[]) => AsyncIterable<ConfirmedOfferPage>;
  warmUp?: () => Promise<void>;
  rateLimit?: RateLimitPause;
}

/**
 * How the pass waits out a vendor that starts answering 429.
 *
 * The client already retries a 429 a few times within a minute. That covers a burst and not a
 * quota: measured on 2026-09-17, NauSYS answered `freeYachts` with 429 on every retry two minutes
 * after a 60-call run. Left to the writer, that one throw ends the pass for the night, so the
 * source pauses and restarts the stream at the week that failed, a bounded number of times.
 * A week yields only once all its batches have answered, so restarting it asks nothing twice
 * that was already written.
 */
export interface RateLimitPause {
  pauseMs: number;
  maxPauses: number;
  sleep: (ms: number) => Promise<void>;
  onPause?: (pause: number, week: SweepPeriod) => void;
}

export const DEFAULT_RATE_LIMIT_PAUSE: RateLimitPause = {
  pauseMs: 2 * 60 * 1000,
  maxPauses: 5,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/**
 * An availability source that only confirms: no occupancy scopes, so the writer skips straight to
 * the confirming pass, and a cursor stated as a date.
 *
 * The inner stream's own cursor is replaced rather than stored. It counts into the list it was
 * handed, and that list is already the remainder of the horizon.
 */
export function priceWeeksSource(options: PriceWeeksSourceOptions): AvailabilitySource {
  return {
    ...(options.warmUp ? { warmUp: options.warmUp } : null),
    listScopes: () => Promise.resolve([]),
    fetchOccupancy: () =>
      Promise.reject(new ContractError("The price-weeks source reads no occupancy")),
    async *searchConfirmed(resume) {
      const pending = remainingWeeks(options.weeks, resume);
      let index = 0;
      let pauses = 0;

      for (;;) {
        try {
          for await (const page of options.stream(pending.slice(index))) {
            const week = pending[index];
            if (!week) {
              throw new ContractError(
                `The confirming stream yielded more pages than ${index} weeks`,
              );
            }
            index += 1;
            const nextCheckIn = pending[index]?.startDate ?? addDays(week.startDate, 7);
            yield { ...page, cursor: { nextCheckIn } };
          }
          return;
        } catch (error) {
          const limit = options.rateLimit;
          const week = pending[index];
          if (!(error instanceof RateLimitedError) || !limit || !week) throw error;
          if (pauses >= limit.maxPauses) throw error;
          pauses += 1;
          limit.onPause?.(pauses, week);
          await limit.sleep(limit.pauseMs);
        }
      }
    },
  };
}
