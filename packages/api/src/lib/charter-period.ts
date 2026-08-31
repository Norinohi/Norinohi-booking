import type { CharterRule } from "./availability-rules";

/**
 * The charter-period rules reduced to the alternatives worth naming.
 *
 * `rules` is a list of alternatives — a period is legal if any one rule admits it — so a
 * listing can genuinely sell Saturday weeks in high season and short flexible stays in the
 * shoulder. Reading `rules[0]` would state one of those as if it were the whole truth, and
 * reading all of them out loud is how the detail page came to say "Sunday to Sunday, or Monday
 * to Monday" through all seven days: those seven rules are one rule, "any start day, whole
 * weeks", written out per weekday because that is the only shape the table can store.
 *
 * So alternatives that differ only in their weekday are folded back into one entry carrying
 * the set of days. Rules that constrain nothing are dropped, since naming them tells a customer
 * nothing and would crowd out the rule that does limit them. An empty result means the listing
 * is unconstrained and the caller should say nothing at all.
 */
export type CharterPeriodRule = {
  /** The days a charter may begin on; null when any day will do. */
  checkinWeekdays: number[] | null;
  /** The day it must end on, where that is a day of its own rather than the one it began on. */
  checkoutWeekday: number | null;
  /** The charter ends on the weekday it began, which is to say it runs in whole weeks. */
  wholeWeeks: boolean;
  minNights: number | null;
  maxNights: number | null;
};

const WEEKDAYS_IN_WEEK = 7;

export function summariseCharterRules(rules: readonly CharterRule[]): CharterPeriodRule[] {
  const groups = new Map<string, CharterPeriodRule>();

  for (const rule of rules) {
    if (constrainsNothing(rule)) continue;

    const wholeWeeks = rule.checkinWeekday !== null && rule.checkinWeekday === rule.checkoutWeekday;
    const minNights = shortestLegal(rule);
    /* Everything but the check-in day, which is what these alternatives differ in. */
    const key = JSON.stringify([
      wholeWeeks,
      wholeWeeks ? null : rule.checkoutWeekday,
      minNights,
      rule.maxNights,
    ]);

    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        checkinWeekdays: rule.checkinWeekday === null ? null : [rule.checkinWeekday],
        checkoutWeekday: wholeWeeks ? null : rule.checkoutWeekday,
        wholeWeeks,
        minNights,
        maxNights: rule.maxNights,
      });
      continue;
    }

    /* One alternative that admits any day makes the rest of the set redundant. */
    if (rule.checkinWeekday === null) {
      group.checkinWeekdays = null;
    } else if (group.checkinWeekdays && !group.checkinWeekdays.includes(rule.checkinWeekday)) {
      group.checkinWeekdays.push(rule.checkinWeekday);
    }
  }

  return [...groups.values()].map(normalise);
}

/**
 * The shortest charter the rule actually admits, which is not always the minimum it states.
 *
 * A check-out weekday fixes the length modulo a week: a Saturday-to-Wednesday rule sells 4
 * nights, 11, 18, and a Saturday-to-Saturday one sells 7, 14, 21, whatever minimum sits
 * beside it. Reading the stated minimum out loud produced sentences that contradicted
 * themselves -- "in whole weeks, from 3 nights", on a listing whose shortest legal charter is
 * seven -- and understated the trip a customer was being asked to plan.
 *
 * Only the floor moves. The rule is unchanged, and the calendar remains the thing that
 * decides any particular pair of days.
 */
function shortestLegal(rule: CharterRule): number | null {
  const stated = rule.minNights;
  if (stated === null || rule.checkoutWeekday === null || rule.checkinWeekday === null) {
    return stated;
  }

  /* The length every legal charter under this rule is congruent to, a full week when the
     two weekdays match rather than the zero the arithmetic would otherwise give. */
  const span = (rule.checkoutWeekday - rule.checkinWeekday + WEEKDAYS_IN_WEEK) % WEEKDAYS_IN_WEEK;
  const step = span === 0 ? WEEKDAYS_IN_WEEK : span;
  if (stated <= step) return step;

  return step + Math.ceil((stated - step) / WEEKDAYS_IN_WEEK) * WEEKDAYS_IN_WEEK;
}

/** Naming all seven days is a longer way of saying the day does not matter. */
function normalise(group: CharterPeriodRule): CharterPeriodRule {
  if (group.checkinWeekdays === null) return group;
  if (group.checkinWeekdays.length === WEEKDAYS_IN_WEEK) {
    return { ...group, checkinWeekdays: null };
  }
  return { ...group, checkinWeekdays: [...group.checkinWeekdays].sort((a, b) => a - b) };
}

function constrainsNothing(rule: CharterRule): boolean {
  return (
    rule.checkinWeekday === null &&
    rule.checkoutWeekday === null &&
    rule.minNights === null &&
    rule.maxNights === null
  );
}
