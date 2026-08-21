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

/** The longest charter considered anywhere here. Three weeks covers the fortnight most cap at. */
const MAX_NIGHTS = 21;

/**
 * The length assumed for a rule that states no minimum of its own.
 *
 * Only ever used to decide which legal charter to *offer*, never to decide what is legal: a
 * listing whose provider published no minimum is not thereby selling single nights, it is a
 * listing whose provider published nothing, and a card reading "20 Aug to 21 Aug" beside a
 * weekly rate is an artefact of that silence rather than a period anyone wants.
 */
const ASSUMED_NIGHTS = 7;

/** How far past the offered day `firstBookablePeriod` keeps looking. */
const SEARCH_DAYS = 35;

function toUtcMs(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

export function addDays(day: string, days: number): string {
  return new Date(toUtcMs(day) + days * MS_PER_DAY).toISOString().slice(0, 10);
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

/**
 * Containment, one way only: a charter is refused when it *contains* a period the provider
 * refused, never when it merely overlaps or sits inside one.
 *
 * The direction is the whole point. A charter needs the boat for every day it spans, so if the
 * vendor will not hand it over across some inner stretch, no longer charter over that stretch
 * is possible either — refusing the week from 19 September refuses the fortnight that starts
 * with it. The converse does not hold and must not be inferred: refusing a fortnight says only
 * that the fortnight is too long, and folding that into the week starting the same Saturday
 * hid charters the vendor would have sold.
 *
 * An exact match is the common case, since the sweep asks in whole weeks.
 */
function wasRefused(
  refused: readonly DatePeriod[] | undefined,
  checkIn: string,
  checkOut: string,
): boolean {
  return (
    refused?.some((period) => checkIn <= period.startDate && period.endDate <= checkOut) ?? false
  );
}

/**
 * Whether a day could begin a charter at all, which is what a calendar grid needs before a
 * range exists.
 *
 * This proves a legal check-out follows, which is the whole point: the cheaper test — right
 * weekday, not inside a booking, inside a published rate — admits the last days of a gap too
 * short to sell and every mid-week day of a listing that only turns around on Saturdays. Those
 * days are clickable and then lead nowhere, which reads as a broken picker, and the ones that
 * escape into `bookable_from` send a card's "available from" date to a calendar that refuses it.
 */
export function canCheckIn(day: string, constraints: CharterConstraints): boolean {
  if (!admitsWeekday(constraints.rules, day)) return false;
  if (constraints.occupied.some((period) => covers(period, day))) return false;
  if (!constraints.priced.some((period) => covers(period, day))) return false;

  return firstCheckOut(day, constraints) !== null;
}

function admitsWeekday(rules: readonly CharterRule[], day: string): boolean {
  if (rules.length === 0) return true;

  const weekday = weekdayOf(day);
  return rules.some((rule) => rule.checkinWeekday === null || rule.checkinWeekday === weekday);
}

/**
 * Every check-out that completes a legal charter from `checkIn`, soonest first.
 *
 * A calendar needs the count as well as the days: where a listing's rules leave exactly one
 * legal end, asking for a second click is asking the visitor to find the single day that is
 * not greyed out, which is the strictest listings punishing their own customers hardest.
 */
export function legalCheckOuts(checkIn: string, constraints: CharterConstraints): string[] {
  const days: string[] = [];
  for (let nights = 1; nights <= MAX_NIGHTS; nights++) {
    const checkOut = addDays(checkIn, nights);
    if (rangeStatus(checkIn, checkOut, constraints) === "bookable") days.push(checkOut);
  }
  return days;
}

/**
 * The shortest check-out that completes a legal charter from `checkIn`, or null.
 *
 * Every length is tried, including the ones no rule was written for, because this is what
 * decides whether a calendar day is clickable at all: skipping a length here would disable a
 * day the provider would happily sell.
 */
export function firstCheckOut(checkIn: string, constraints: CharterConstraints): string | null {
  for (let nights = 1; nights <= MAX_NIGHTS; nights++) {
    const checkOut = addDays(checkIn, nights);
    if (rangeStatus(checkIn, checkOut, constraints) === "bookable") return checkOut;
  }
  return null;
}

/**
 * The check-out to *offer* for a charter starting on `checkIn`, which is the shortest one the
 * rules were written for rather than the shortest one they fail to forbid.
 *
 * Mirrored by the `bookable_to` lateral in packages/db/src/search/read-model.ts, which has to
 * reach the same answer in SQL for the search card. Keep the two together: the shape is one
 * length per rule, the rule's own minimum snapped up to its check-out weekday, smallest first.
 */
export function offeredCheckOut(checkIn: string, constraints: CharterConstraints): string | null {
  for (const nights of offeredNights(constraints.rules, checkIn)) {
    const checkOut = addDays(checkIn, nights);
    if (rangeStatus(checkIn, checkOut, constraints) === "bookable") return checkOut;
  }
  /* The rules describe what is usually sold, not all of it; never claim nothing over a detail. */
  return firstCheckOut(checkIn, constraints);
}

function offeredNights(rules: readonly CharterRule[], checkIn: string): number[] {
  const lengths = new Set<number>();

  for (const rule of rules.length === 0 ? [UNCONSTRAINED] : rules) {
    const base = Math.max(rule.minNights ?? ASSUMED_NIGHTS, 1);
    const nights =
      rule.checkoutWeekday === null
        ? base
        : base + ((rule.checkoutWeekday - weekdayOf(addDays(checkIn, base)) + 7) % 7);

    if (rule.maxNights !== null && nights > rule.maxNights) continue;
    if (nights <= MAX_NIGHTS) lengths.add(nights);
  }

  return [...lengths].sort((a, b) => a - b);
}

const UNCONSTRAINED: CharterRule = {
  checkinWeekday: null,
  checkoutWeekday: null,
  minNights: null,
  maxNights: null,
};

/**
 * The earliest charter this listing will sell from `from` onwards, or null.
 *
 * `from` is normally a day already meant to be a legal check-in — a card's materialised
 * `bookableFrom`, say — so the walk forward is a tolerance for the listing having moved since
 * that was written rather than a scan of the season.
 */
export function firstBookablePeriod(
  from: string,
  constraints: CharterConstraints,
): DatePeriod | null {
  for (let offset = 0; offset <= SEARCH_DAYS; offset++) {
    const startDate = addDays(from, offset);
    if (!admitsWeekday(constraints.rules, startDate)) continue;

    const endDate = offeredCheckOut(startDate, constraints);
    if (endDate !== null) return { startDate, endDate };
  }
  return null;
}

/** Whether a day may close the charter that began on `checkIn`. */
export function canCheckOut(
  day: string,
  checkIn: string,
  constraints: CharterConstraints,
): boolean {
  return rangeStatus(checkIn, day, constraints) === "bookable";
}
