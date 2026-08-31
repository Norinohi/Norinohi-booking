import { sweepPeriods, type SweepPeriod } from "../shared/sweep-periods";
import type { NausysHotWindow } from "./occupancy";

/**
 * How many upcoming charter weeks the accurate availability pass walks by default.
 * Each one is a paged `freeYachtsSearch` on the serialized sync lane, so this trades
 * confirmed prices against how long the run occupies it.
 *
 * Six months rather than two, because eight weeks is shorter than the season people book in.
 * These searches are the only place the vendor states a price in the currency we asked for --
 * the catalogue price lists carry whichever currency the charter company set, and take no
 * currency parameter -- so a charter beyond the horizon has no confirmed price and its card
 * falls back to the published list. A Bahamas boat whose first sellable charter is twelve
 * weeks out was priced in USD beside a detail page quoting EUR for exactly that reason.
 *
 * Affordable because the walk resumes rather than restarts: the cursor carries `windowIndex`
 * and the pass stops on its own budget, so a wider horizon is spread over more runs instead of
 * making any one of them longer. The cursor only resets to the first window once a pass gets
 * all the way through, which is what keeps the near weeks refreshed on a cycle rather than
 * left behind.
 */
export const DEFAULT_HOT_WINDOW_COUNT = 26;

const SATURDAY = 6;
const DAY_MS = 86_400_000;

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * The next N Saturday-to-Saturday weeks.
 *
 * Saturday turnaround is the Adriatic bareboat norm and the only check-in day the
 * recorded NauSYS `checkInPeriods` use, so these windows line up with the periods
 * the synthesizer generates. A window that matched no synthesized slot would
 * confirm nothing.
 */
export function upcomingCharterWeeks(from: Date, count: number): NausysHotWindow[] {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const untilSaturday = (SATURDAY - new Date(start).getUTCDay() + 7) % 7;
  const first = start + untilSaturday * DAY_MS;

  return Array.from({ length: count }, (_, index) => {
    const checkIn = new Date(first + index * 7 * DAY_MS);
    return {
      periodFrom: isoDay(checkIn),
      periodTo: isoDay(new Date(checkIn.getTime() + 7 * DAY_MS)),
    };
  });
}

/**
 * The weeks the NauSYS sweep asks about, in its own request shape.
 *
 * The grid alone was the bug. A card prints one exact charter and this sweep is the only
 * thing that can price it in the currency we transact in, so a period the grid never names --
 * every non-Saturday charter -- keeps the catalogue list rate, which on NauSYS is the price
 * before the operator's own discount. Every price mismatch in a 30-listing production sample
 * was this: eleven cards above their own quote by 5% to 53%, all NauSYS, while all twelve
 * Booking Manager cards were exact, because Booking Manager publishes no discounts.
 *
 * The selection and its order live in `sweepPeriods`, which both adapters share.
 */
export function sweepWindows(
  advertised: readonly SweepPeriod[],
  fallback: readonly NausysHotWindow[],
  today: string,
): NausysHotWindow[] {
  const periods = sweepPeriods(
    advertised,
    fallback.map((window) => ({ startDate: window.periodFrom, endDate: window.periodTo })),
    { today },
  );

  return periods.map((period) => ({ periodFrom: period.startDate, periodTo: period.endDate }));
}
