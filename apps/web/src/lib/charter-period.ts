import {
  canCheckIn,
  canCheckOut,
  type CharterConstraints,
  type CharterRule,
} from "@yacht-charter/api/lib/availability-rules";

import { addDays } from "./date";

/*
 * How far past the offered day to keep looking, and how long a charter to consider. The day
 * handed in is already meant to be a legal check-in, so the search is a tolerance for the
 * listing having moved since the read model was built, not a scan of the season. Three weeks
 * of nights covers the fortnight most operators cap at.
 */
const SEARCH_DAYS = 35;
const MAX_NIGHTS = 21;

/**
 * The earliest, shortest charter this listing will sell from `from` onwards, or null.
 *
 * `availability.bookableFrom` names a day a charter may begin but proves no legal check-out
 * follows it, so the end is found here against the same published constraints the calendar
 * draws from. Returns the shortest legal charter rather than a fixed week: what "a week"
 * means is the operator's rules, and a listing that sells four-night stays should open on one.
 */
export function firstBookablePeriod(
  from: string,
  constraints: CharterConstraints,
): { checkIn: string; checkOut: string } | null {
  for (let offset = 0; offset <= SEARCH_DAYS; offset++) {
    const checkIn = addDays(from, offset);
    if (!canCheckIn(checkIn, constraints)) continue;

    for (let nights = 1; nights <= MAX_NIGHTS; nights++) {
      const checkOut = addDays(checkIn, nights);
      if (canCheckOut(checkOut, checkIn, constraints)) return { checkIn, checkOut };
    }
  }

  return null;
}

/**
 * The charter-period rules a listing sells on, reduced to what is worth saying.
 *
 * `rules` is a list of alternatives — a period is legal if any one rule admits it — so a
 * listing can genuinely sell Saturday weeks in high season and short flexible stays in the
 * shoulder. Reading `rules[0]` would state one of those as if it were the whole truth.
 *
 * Rules that constrain nothing are dropped: they admit every period, so naming them tells a
 * customer nothing and would crowd out the rule that actually limits them. An empty result
 * means the listing is unconstrained and the caller should say nothing at all.
 */
export function summariseCharterRules(rules: readonly CharterRule[]): CharterRule[] {
  const seen = new Set<string>();
  const summary: CharterRule[] = [];

  for (const rule of rules) {
    if (constrainsNothing(rule)) continue;

    // Alternatives are often repeated across seasons that share a shape.
    const key = JSON.stringify([
      rule.checkinWeekday,
      rule.checkoutWeekday,
      rule.minNights,
      rule.maxNights,
    ]);
    if (seen.has(key)) continue;

    seen.add(key);
    summary.push(rule);
  }

  return summary;
}

function constrainsNothing(rule: CharterRule): boolean {
  return (
    rule.checkinWeekday === null &&
    rule.checkoutWeekday === null &&
    rule.minNights === null &&
    rule.maxNights === null
  );
}
