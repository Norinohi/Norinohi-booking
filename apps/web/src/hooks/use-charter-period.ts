"use client";

import type { CharterRule } from "@yacht-charter/api/lib/availability-rules";
import { useFormatter, useTranslations } from "next-intl";

import {
  type CharterPeriodRule,
  summariseCharterRules,
} from "@yacht-charter/api/lib/charter-period";

/*
 * A Sunday, so `+ weekday` lands on the day `weekdayOf` means: the rules carry
 * `getUTCDay()` indexes, where 0 is Sunday and 6 is Saturday.
 */
const WEEKDAY_EPOCH = Date.UTC(2026, 0, 4);
const DAY_MS = 86_400_000;

/**
 * The charter-period rules as one sentence, or null when nothing constrains them.
 *
 * The calendar already refuses illegal days, which without this reads as "booked solid" or
 * a broken picker rather than "this yacht sells Saturday weeks". Saying it out loud is the
 * difference between a rule and a dead end.
 */
export function useCharterPeriodLabel(rules: readonly CharterRule[]): string | null {
  const t = useTranslations("Common.charterPeriod");
  const format = useFormatter();

  const weekday = (index: number) =>
    format.dateTime(new Date(WEEKDAY_EPOCH + index * DAY_MS), {
      weekday: "long",
      timeZone: "UTC",
    });
  const weekdays = (indexes: number[]) =>
    format.list(indexes.map(weekday), { type: "disjunction" });

  const parts = summariseCharterRules(rules).map((rule) => describe(rule, t, weekday, weekdays));

  if (parts.length === 0) return null;

  /* Alternatives, so they are joined as alternatives rather than run together as one rule. */
  return parts.join(t("or"));
}

type Translate = ReturnType<typeof useTranslations<"Common.charterPeriod">>;
type Weekday = (index: number) => string;
type Weekdays = (indexes: number[]) => string;

function describe(
  rule: CharterPeriodRule,
  t: Translate,
  weekday: Weekday,
  weekdays: Weekdays,
): string {
  const days = describeDays(rule, t, weekday, weekdays);
  const nights = describeNights(rule, t);

  if (days && nights) return t("daysAndNights", { days, nights });
  return days ?? nights ?? "";
}

/*
 * "Any start day, in whole weeks" is the phrasing that replaced seven "X to X" clauses. It is
 * the same rule, and it is the one customers can act on: the day is free, the length is not.
 */
function describeDays(
  rule: CharterPeriodRule,
  t: Translate,
  weekday: Weekday,
  weekdays: Weekdays,
): string | null {
  const { checkinWeekdays: start, checkoutWeekday: end, wholeWeeks } = rule;

  if (wholeWeeks) {
    if (start === null) return t("wholeWeeksAnyDay");
    if (start.length === 1 && start[0] !== undefined) {
      return t("weekdayRange", { from: weekday(start[0]), to: weekday(start[0]) });
    }
    return t("wholeWeeksFromDays", { days: weekdays(start) });
  }

  if (start !== null && end !== null) {
    return start.length === 1 && start[0] !== undefined
      ? t("weekdayRange", { from: weekday(start[0]), to: weekday(end) })
      : t("weekdaysToDay", { days: weekdays(start), to: weekday(end) });
  }
  if (start !== null) return t("weekdayStart", { day: weekdays(start) });
  if (end !== null) return t("weekdayEnd", { day: weekday(end) });

  return null;
}

function describeNights(rule: CharterPeriodRule, t: Translate): string | null {
  const { minNights: min, maxNights: max } = rule;

  if (min !== null && max !== null) {
    return min === max ? t("nightsExact", { count: min }) : t("nightsRange", { min, max });
  }
  if (min !== null) return t("nightsFrom", { count: min });
  if (max !== null) return t("nightsUpTo", { count: max });

  return null;
}
