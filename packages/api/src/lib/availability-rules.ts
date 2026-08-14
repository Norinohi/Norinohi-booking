/*
 * Whether a charter period is one the provider will sell, decided from the constraints
 * rather than from a list of pre-cut offers.
 *
 * `availability_slot` holds an enumeration the sync synthesized: it walks one reading of
 * the check-in rule and steps a week at a time, so a listing that sells a 1-night charter
 * on any day appears as 1-night blocks once a week. Asking these functions instead lets a
 * caller offer a period nobody enumerated. The quote endpoint remains the authority — this
 * only decides what is worth asking about.
 *
 * Dates are ISO `yyyy-MM-dd` and periods are half-open: the day one charter ends is the day
 * the next may begin, which is the turnaround, not a clash.
 */

/** 0 Sunday to 6 Saturday, matching `listing_checkin_rule` and `Date#getUTCDay`. */
export type CharterRule = {
  checkinWeekday: number | null;
  checkoutWeekday: number | null;
  minNights: number | null;
  maxNights: number | null;
};

export type DatePeriod = { startDate: string; endDate: string };

export type CharterConstraints = {
  /** Alternatives: a period is legal if any one rule admits it. */
  rules: readonly CharterRule[];
  occupied: readonly DatePeriod[];
  /** Periods carrying a published rate. Used as a season-open signal, not to price. */
  priced: readonly DatePeriod[];
  /**
   * Exact periods the provider refused when asked to price them.
   *
   * Matched by both ends, never by overlap: the vendor said no to *this* charter, not to
   * the days it spans. Folding these into `occupied` inferred the second from the first
   * and hid bookable trips — refusing a fortnight from a Saturday took the perfectly free
   * week starting the same day with it, and the boat read as gone when it was not.
   */
  refused?: readonly DatePeriod[];
};

export type RangeVerdict =
  | "bookable"
  | "invalid-range"
  | "checkin-day"
  | "checkout-day"
  | "too-short"
  | "too-long"
  | "occupied"
  /** This exact period was already offered to the provider and turned down. */
  | "refused"
  | "season-closed";

const MS_PER_DAY = 86_400_000;

function toUtcMs(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

export function weekdayOf(day: string): number {
  return new Date(toUtcMs(day)).getUTCDay();
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((toUtcMs(checkOut) - toUtcMs(checkIn)) / MS_PER_DAY);
}

/** Half-open on both sides, so touching periods do not overlap. */
function overlaps(checkIn: string, checkOut: string, period: DatePeriod): boolean {
  return checkIn < period.endDate && period.startDate < checkOut;
}

function covers(period: DatePeriod, day: string): boolean {
  return period.startDate <= day && day < period.endDate;
}

/*
 * A length failure outranks a weekday failure: it means the caller already picked a day the
 * listing accepts, so that is the more useful thing to say.
 */
const VIOLATION_PRIORITY = ["too-long", "too-short", "checkout-day", "checkin-day"] as const;
type RuleViolation = (typeof VIOLATION_PRIORITY)[number];

function violationFor(rule: CharterRule, checkIn: string, checkOut: string): RuleViolation | null {
  const nights = nightsBetween(checkIn, checkOut);
  if (rule.checkinWeekday !== null && weekdayOf(checkIn) !== rule.checkinWeekday) {
    return "checkin-day";
  }
  if (rule.checkoutWeekday !== null && weekdayOf(checkOut) !== rule.checkoutWeekday) {
    return "checkout-day";
  }
  if (rule.minNights !== null && nights < rule.minNights) return "too-short";
  if (rule.maxNights !== null && nights > rule.maxNights) return "too-long";
  return null;
}

/**
 * Empty rules admit any shape on purpose. The array is what the provider published, and
 * inventing a constraint it never stated would hide dates it would happily sell. The sync
 * takes the opposite default (Saturday to Saturday, seven nights) because it has to write
 * *something*; here there is a live quote behind the decision, so guessing is unnecessary.
 */
function violationAcrossRules(
  rules: readonly CharterRule[],
  checkIn: string,
  checkOut: string,
): RuleViolation | null {
  if (rules.length === 0) return null;

  const violations: RuleViolation[] = [];
  for (const rule of rules) {
    const violation = violationFor(rule, checkIn, checkOut);
    if (violation === null) return null;
    violations.push(violation);
  }
  return (
    VIOLATION_PRIORITY.find((candidate) => violations.includes(candidate)) ?? violations[0] ?? null
  );
}

/**
 * The provider publishes no rate for a season it has not opened, so a date no priced period
 * touches is not sellable however free it looks. This is a season signal, not a price: a
 * weekly rate says nothing about what three nights inside that week cost.
 */
function seasonOpen(priced: readonly DatePeriod[], checkIn: string, checkOut: string): boolean {
  return priced.some((period) => overlaps(checkIn, checkOut, period));
}

export function rangeStatus(
  checkIn: string,
  checkOut: string,
  constraints: CharterConstraints,
): RangeVerdict {
  if (checkOut <= checkIn) return "invalid-range";

  const violation = violationAcrossRules(constraints.rules, checkIn, checkOut);
  if (violation !== null) return violation;

  if (wasRefused(constraints.refused, checkIn, checkOut)) return "refused";
  if (constraints.occupied.some((period) => overlaps(checkIn, checkOut, period))) return "occupied";
  if (!seasonOpen(constraints.priced, checkIn, checkOut)) return "season-closed";

  return "bookable";
}

/** Both ends, deliberately: see `refused` on CharterConstraints. */
function wasRefused(
  refused: readonly DatePeriod[] | undefined,
  checkIn: string,
  checkOut: string,
): boolean {
  return (
    refused?.some((period) => period.startDate === checkIn && period.endDate === checkOut) ?? false
  );
}

/**
 * Whether a day could begin a charter at all, which is what a calendar grid needs before a
 * range exists. Deliberately cheap: it does not prove some legal check-out follows, so a day
 * this admits can still yield no valid range once the visitor picks an end.
 */
export function canCheckIn(day: string, constraints: CharterConstraints): boolean {
  const weekday = weekdayOf(day);
  const dayAllowed =
    constraints.rules.length === 0 ||
    constraints.rules.some(
      (rule) => rule.checkinWeekday === null || rule.checkinWeekday === weekday,
    );
  if (!dayAllowed) return false;

  if (constraints.occupied.some((period) => covers(period, day))) return false;
  return constraints.priced.some((period) => covers(period, day));
}

/** Whether a day may close the charter that began on `checkIn`. */
export function canCheckOut(
  day: string,
  checkIn: string,
  constraints: CharterConstraints,
): boolean {
  return rangeStatus(checkIn, day, constraints) === "bookable";
}
