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
export type SweepPeriod = { startDate: string; endDate: string };

/**
 * How many advertised periods the sweep takes from the read model. Enough to cover the fleet
 * several times over: 349 distinct periods carry 16,500 dated cards, and the ten commonest
 * carry 13,500 of them, so the tail is a long list of near-empty windows.
 */
export const ADVERTISED_PERIOD_LIMIT = 60;

export interface SweepPeriodOptions {
  /**
   * Today. Periods that have already ended are dropped: nobody can buy last April, and on
   * Booking Manager the grid ran from 1 January, so a third of every budgeted run was spent
   * asking about weeks that were over.
   */
  today: string;
}

/**
 * The advertised periods first, in the order given, then whatever the fallback grid adds.
 *
 * The order costs some cursor precision — a resumed run counts into a list that can move as
 * charters sell, so it may re-ask one period or defer another. That is a refreshed price
 * rather than a wrong one, and it is the trade the budget forces: the pass never reaches the
 * end of the list, so the front of it decides what gets priced at all.
 */
export function sweepPeriods(
  advertised: readonly SweepPeriod[],
  fallback: readonly SweepPeriod[],
  options: SweepPeriodOptions,
): SweepPeriod[] {
  const chosen = new Map<string, SweepPeriod>();

  for (const period of [...advertised, ...fallback]) {
    if (period.endDate <= options.today) continue;

    const key = `${period.startDate}|${period.endDate}`;
    /* First mention wins, so a week both lists name keeps its advertised position. */
    if (chosen.has(key)) continue;
    chosen.set(key, { startDate: period.startDate, endDate: period.endDate });
  }

  return [...chosen.values()];
}
