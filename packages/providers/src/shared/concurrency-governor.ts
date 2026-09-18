/**
 * A fan-out width one run may narrow but never widen.
 *
 * A sweep that overlaps vendor calls has to answer what it does when the vendor says it is
 * overloaded. The client already retries a 429 within the minute, so a governor reaching this
 * point means the retries did not settle it, and asking the same number of questions again is
 * how a burst becomes a blocked credential. Halving is enough: the passes that use this run
 * between one and eight lanes, so two steps reach the sequential floor.
 *
 * It never recovers within the run on purpose. Widening again after a quiet minute would make
 * the run oscillate against a quota it cannot see, and a night spent at half speed costs a
 * resumable pass one night, while tripping the vendor's rule costs a day of live quotes too.
 */
export interface ConcurrencyGovernor {
  /** The width to fill to now. Read per launch, so a narrowing applies to the rest of the run. */
  limit(): number;
  /** Halves the width, never below one. */
  backOff(): void;
}

export interface ConcurrencyGovernorOptions {
  start: number;
  onBackOff?: (limit: number) => void;
}

export function createConcurrencyGovernor(
  options: ConcurrencyGovernorOptions,
): ConcurrencyGovernor {
  let limit = Math.max(1, Math.trunc(options.start));

  return {
    limit: () => limit,
    backOff: () => {
      if (limit <= 1) return;
      limit = Math.max(1, Math.floor(limit / 2));
      options.onBackOff?.(limit);
    },
  };
}
