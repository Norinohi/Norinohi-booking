/**
 * Which charters a confirming sweep asks a vendor to price, and in what order.
 *
 * Both adapters have the same pass and the same constraint on it: the vendor answers for one
 * period at a time, the run is budgeted, and it resumes by counting how many periods it has
 * already walked. So what matters is not how many periods the list holds but which ones come
 * first, and the honest priority is what the cards are advertising right now.
 *
 * The standing grid of upcoming charter weeks stays behind them. A listing with no bookable
 * period advertises nothing to ask about, and those are exactly the ones the grid can rescue:
 * a confirmed price is also what mints a period.
 */
export type SweepPeriod = {
  startDate: string;
  endDate: string;
  /**
   * Which of the two lists put this period in the walk.
   *
   * The resume cursor counts into the grid alone, so the two have to stay tellable apart after
   * they are merged. See `sweepPlan`.
   */
  source?: "advertised" | "grid";
  /**
   * The provider-side hulls advertising this exact charter, where the caller knows them.
   *
   * A vendor that prices one hull at a time need only be asked about these: the whole fleet was
   * 7,484 hulls against the 110 that advertise a given week, and a pass budgeted on the clock
   * spent that difference finishing three periods per run instead of all sixty.
   *
   * The grid carries a list too, but never this one: its hulls are the ones advertising no
   * charter at all, which is who it exists to rescue. Each caller attaches its own.
   */
  yachtIds?: readonly string[];
};

/**
 * How many advertised periods the sweep takes from the read model. Enough to cover the fleet
 * several times over: 349 distinct periods carry 16,500 dated cards, and the ten commonest
 * carry 13,500 of them, so the tail is a long list of near-empty windows.
 */
export const ADVERTISED_PERIOD_LIMIT = 60;

/**
 * The two halves of one pass, in the order they are walked: every advertised period, then the
 * grid from wherever the cursor left it.
 */
export interface SweepPlan {
  advertised: SweepPeriod[];
  grid: SweepPeriod[];
}

export interface SweepPeriodOptions {
  /**
   * Today. Periods that have already ended are dropped: nobody can buy last April, and on
   * Booking Manager the grid ran from 1 January, so a third of every budgeted run was spent
   * asking about weeks that were over.
   */
  today: string;
}

/**
 * The advertised periods, and the fallback grid behind them, kept apart.
 *
 * They are returned as two lists rather than one because the budget and the resume cursor
 * treat them differently, and merging them is what broke the pass. A single list with a
 * positional cursor resumes wherever the budget stopped, which after one truncated run is
 * always inside the grid -- so every later run skipped all sixty advertised periods and spent
 * itself on the grid instead, until the index wrapped nine or ten runs later. Measured on the
 * NauSYS fleet, that left 60 of 6,985 dated cards priced for the week they advertise; the same
 * pass walked from the front priced 6,562 of them.
 *
 * So the advertised periods are swept from the front on every run -- they are what the cards
 * are showing, and a stale price on one is the visible failure -- and the cursor counts into
 * the grid alone, which is the part that is genuinely a backlog to work through.
 */
export function sweepPlan(
  advertised: readonly SweepPeriod[],
  fallback: readonly SweepPeriod[],
  options: SweepPeriodOptions,
): SweepPlan {
  const chosen = new Map<string, SweepPeriod>();

  for (const [source, list] of [
    ["advertised", advertised],
    ["grid", fallback],
  ] as const) {
    for (const period of list) {
      if (period.endDate <= options.today) continue;

      const key = `${period.startDate}|${period.endDate}`;
      /* First mention wins, so a week both lists name stays advertised, and keeps with it the
         hulls that advertise it: the grid names the same week for the whole fleet. */
      if (chosen.has(key)) continue;
      chosen.set(key, {
        startDate: period.startDate,
        endDate: period.endDate,
        source,
        ...(period.yachtIds ? { yachtIds: period.yachtIds } : null),
      });
    }
  }

  const periods = [...chosen.values()];
  return {
    advertised: periods.filter((period) => period.source === "advertised"),
    grid: periods.filter((period) => period.source === "grid"),
  };
}
