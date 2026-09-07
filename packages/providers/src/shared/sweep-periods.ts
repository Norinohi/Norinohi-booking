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
 * How many advertised periods the sweep reads out of the read model.
 *
 * Every one of them, near enough: this is a single indexed group-by, and the cost of the pass is
 * in the vendor calls the plan below rations, not in the rows it reads. It used to be 60, which
 * was the ration itself -- and a period ranked 61st was therefore never asked about at all, on
 * any run, ever. 278 periods sat past that line carrying 470 dated cards between them, each one
 * advertising a charter with a season floor beside it because nothing had priced the charter.
 */
export const ADVERTISED_PERIOD_LIMIT = 400;

/**
 * The advertised periods re-asked on every run.
 *
 * These are the cards' visible surface and a stale price on one is the failure people see, so
 * freshness here beats coverage: the sixty commonest periods carry 6,600 of 7,002 NauSYS dated
 * cards and 10,049 of 10,117 Booking Manager ones. Sixty is what the pass already swept every
 * run, kept deliberately, so nothing that is fresh today becomes staler for this change.
 */
export const ADVERTISED_HEAD_LIMIT = 60;

/**
 * How many of the periods behind the head one run may add.
 *
 * The tail is a backlog, not a freshness surface: its periods carry one to five cards each, and
 * what they need is to be asked about at all rather than asked about hourly. So a run takes a
 * bounded slice and the next takes the following one, walking the whole 234-period NauSYS tail
 * in two runs and the 44-period Booking Manager one in a single run, on the hourly schedule in
 * docs/scheduled-jobs.md.
 *
 * The size is set by what the grid can spare, because the grid queues behind this and the pass
 * is capped by wall-clock rather than by completeness. Measured against NauSYS `freeYachts` on
 * the sync lane, over two advertised weeks, three calls each:
 *
 *     1 hull ~340-390ms | 5 hulls ~330-410ms | 100 hulls ~1.0-1.1s | 250 hulls ~1.5-1.7s
 *
 * A call is mostly fixed cost, so a tail period -- one to five hulls -- is roughly a quarter of
 * a full 250-hull batch rather than the same price. Against the 5 minute
 * DEFAULT_HOT_WINDOW_BUDGET_MS and the slower of the two runs: a 60-period head costs about
 * 102s, this slice about 54s, and the grid's 52 chunks about 88s, which is 244s of 300s and
 * leaves roughly a fifth of the budget as margin.
 *
 * It was 15, sized off the 3.4s-per-call figure recorded in `streamNausysConfirmedOffers`. That
 * number is a 250-hull batch and was about twice what a 250-hull batch now measures, so a tail
 * period was being rationed at eight times its real cost and the tail took sixteen runs to walk
 * instead of two. Re-measure before moving this again; the arithmetic above is the whole basis
 * for it, and it was measured from a developer machine rather than from the Railway region the
 * cron actually runs in.
 */
export const ADVERTISED_TAIL_PER_RUN = 120;

/** The sweep's cadence, which is what one step of the tail rotation means. */
const ROTATION_MS = 60 * 60 * 1000;

/**
 * Which slice of the tail this run takes, counted off the clock rather than off a cursor.
 *
 * The resume cursor cannot carry it. A run that finishes its walk clears the cursor -- that is
 * what makes the grid start over -- and a tail rotation stored there would be reset with it,
 * pinning every run to the same first slice. The clock is not resettable, needs no schema, and
 * degrades harmlessly: a run that is skipped skips a slice, and the walk comes round again.
 */
export function sweepRotation(now: Date): number {
  return Math.floor(now.getTime() / ROTATION_MS);
}

/**
 * The two halves of one pass, in the order they are walked: every advertised period, then the
 * grid from wherever the cursor left it.
 */
export interface SweepPlan {
  /**
   * Walked in full every run: the head, plus this run's slice of the tail behind it. The two
   * are concatenated rather than returned apart because the walk treats them identically --
   * neither is resumed into, both are re-chosen when the next run plans itself.
   */
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
  /**
   * Which slice of the tail to take, from `sweepRotation`. Absent, the walk starts at the front
   * of the tail every time -- correct for a single run and for every test, wrong only for the
   * scheduled loop, which is why the adapters pass it.
   */
  rotation?: number;
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
  const advertisedPeriods = periods.filter((period) => period.source === "advertised");

  /*
   * The head every run, then one rotating slice of everything behind it.
   *
   * The caller hands the list over most-advertised first, so the head is the periods the most
   * cards are showing and the tail is the long thin end -- 234 of the 294 NauSYS periods,
   * carrying 402 cards between them. That end used to be cut off rather than queued: the read
   * model was asked for sixty periods and the sixty were swept, so a card advertising a charter
   * nobody else advertised was never priced, on any run, and kept the season floor for ever.
   *
   * Rotating rather than resuming, for the reason on `sweepRotation`: the cursor that would
   * carry a resume position is cleared whenever a run completes its walk.
   */
  const head = advertisedPeriods.slice(0, ADVERTISED_HEAD_LIMIT);
  const tail = advertisedPeriods.slice(ADVERTISED_HEAD_LIMIT);

  return {
    advertised: [...head, ...rotatedSlice(tail, options.rotation ?? 0)],
    grid: periods.filter((period) => period.source === "grid"),
  };
}

/**
 * `ADVERTISED_TAIL_PER_RUN` periods from a list treated as a ring, starting where this run's
 * rotation left off. An empty list yields nothing, and a rotation shorter than the list still
 * wraps past the end rather than running short at it.
 */
function rotatedSlice(periods: readonly SweepPeriod[], rotation: number): SweepPeriod[] {
  if (periods.length === 0) return [];
  const offset = rotation * ADVERTISED_TAIL_PER_RUN;
  const start = ((offset % periods.length) + periods.length) % periods.length;
  const ring = [...periods.slice(start), ...periods.slice(0, start)];
  return ring.slice(0, ADVERTISED_TAIL_PER_RUN);
}
