import { MIN_LEAD_DAYS } from "./read-model";
import type { ListingSearchInput } from "./types";

/*
 * How much of the calendar a start date with no length claims. A week is what the vendors sell
 * and what the duration facet opens on, so it is the span a visitor naming only a date is asking
 * after. It sizes the window alone: the length rules are left out of it, because nobody stated a
 * length to hold a boat to.
 */
const DEFAULT_WINDOW_NIGHTS = 7;

export function availabilityWindowFor(
  input: ListingSearchInput,
): { checkIn: string; checkOut: string } | undefined {
  if (input.checkIn && input.checkOut) {
    return { checkIn: input.checkIn, checkOut: input.checkOut };
  }

  if (!input.startDate) return undefined;

  const start = new Date(`${input.startDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return undefined;

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (input.duration ?? DEFAULT_WINDOW_NIGHTS));
  /*
   * A duration large enough to walk the date past the range `Date` can hold leaves an invalid
   * one, and `toISOString` throws on it. The contract bounds `duration` so the API cannot reach
   * this, but the repository is called directly too and a search should not be crashable.
   */
  if (Number.isNaN(end.getTime())) return undefined;

  return {
    checkIn: start.toISOString().slice(0, 10),
    checkOut: end.toISOString().slice(0, 10),
  };
}

/*
 * How far the visitor said their start date can move, in days either side of it.
 *
 * Symmetric, which is what the copy promises: "In 1 week" beside a date is the week around it,
 * not the week after it. A month is 30 days rather than a calendar step -- the filter is a net,
 * and nobody choosing it means "to the 31st and no further".
 */
export const FLEXIBILITY_DAYS = {
  "on-day": 0,
  "1-3-days": 3,
  "1-week": 7,
  "2-weeks": 14,
  "1-month": 30,
} satisfies Record<NonNullable<ListingSearchInput["dateFlexibility"]>, number>;

/**
 * The charters a flexible search would accept: every check-in from `earliestStart` to
 * `latestStart`, each running for the requested number of nights. `earliestEnd` and `latestEnd`
 * are the first and last check-out those imply, so the free-stretch test and the hold test can
 * each be written as plain date comparisons.
 */
export type CandidateRange = {
  earliestStart: string;
  latestStart: string;
  earliestEnd: string;
  latestEnd: string;
};

export function candidateRange(
  window: { checkIn: string; checkOut: string },
  nights: number,
  flex: number,
): CandidateRange {
  return {
    earliestStart: shiftDays(window.checkIn, -flex),
    latestStart: shiftDays(window.checkIn, flex),
    earliestEnd: shiftDays(window.checkIn, -flex + nights),
    latestEnd: shiftDays(window.checkOut, flex),
  };
}

/** How far ahead a length-only search looks for a charter of that length. */
export const UNDATED_SEARCH_HORIZON_DAYS = 365;

/* Where a length with no date can start: from the earliest bookable day, a year out. */
export function undatedRange(nights: number): CandidateRange {
  const earliest = shiftDays(todayUtc(), MIN_LEAD_DAYS);
  return {
    earliestStart: earliest,
    latestStart: shiftDays(earliest, UNDATED_SEARCH_HORIZON_DAYS),
    earliestEnd: shiftDays(earliest, nights),
    latestEnd: shiftDays(earliest, UNDATED_SEARCH_HORIZON_DAYS + nights),
  };
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function shiftDays(date: string, days: number): string {
  const shifted = new Date(`${date}T00:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** Nights in a window, which is what a check-in rule's min/max are counted in. */
export function nightsBetween(window: { checkIn: string; checkOut: string }): number {
  const checkIn = Date.parse(`${window.checkIn}T00:00:00.000Z`);
  const checkOut = Date.parse(`${window.checkOut}T00:00:00.000Z`);
  return Math.round((checkOut - checkIn) / 86_400_000);
}
