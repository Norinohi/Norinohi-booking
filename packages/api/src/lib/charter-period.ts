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
    /* Everything but the check-in day, which is what these alternatives differ in. */
    const key = JSON.stringify([
      wholeWeeks,
      wholeWeeks ? null : rule.checkoutWeekday,
      rule.minNights,
      rule.maxNights,
    ]);

    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        checkinWeekdays: rule.checkinWeekday === null ? null : [rule.checkinWeekday],
        checkoutWeekday: wholeWeeks ? null : rule.checkoutWeekday,
        wholeWeeks,
        minNights: rule.minNights,
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
