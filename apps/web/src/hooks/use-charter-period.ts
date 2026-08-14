"use client";

import type { CharterRule } from "@yacht-charter/api/lib/availability-rules";
import { useFormatter, useTranslations } from "next-intl";

import { summariseCharterRules } from "@/lib/charter-period";

/*
 * A Sunday, so `+ weekday` lands on the day `weekdayOf` means: the rules carry
 * `getUTCDay()` indexes, where 0 is Sunday and 6 is Saturday.
 */
const WEEKDAY_EPOCH = Date.UTC(2026, 0, 4);

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
    format.dateTime(new Date(WEEKDAY_EPOCH + index * 86_400_000), {
      weekday: "long",
      timeZone: "UTC",
    });

  const parts = summariseCharterRules(rules).map((rule) => describe(rule, t, weekday));

  if (parts.length === 0) return null;

  /* Alternatives, so they are joined as alternatives rather than run together as one rule. */
  return parts.join(t("or"));
}

type Translate = ReturnType<typeof useTranslations<"Common.charterPeriod">>;

function describe(rule: CharterRule, t: Translate, weekday: (index: number) => string): string {
  const days = describeDays(rule, t, weekday);
  const nights = describeNights(rule, t);

  if (days && nights) return t("daysAndNights", { days, nights });
  return days ?? nights ?? "";
}

function describeDays(
  rule: CharterRule,
  t: Translate,
  weekday: (index: number) => string,
): string | null {
  const { checkinWeekday: start, checkoutWeekday: end } = rule;

  if (start !== null && end !== null) {
    return t("weekdayRange", { from: weekday(start), to: weekday(end) });
  }
  if (start !== null) return t("weekdayStart", { day: weekday(start) });
  if (end !== null) return t("weekdayEnd", { day: weekday(end) });

  return null;
}

function describeNights(rule: CharterRule, t: Translate): string | null {
  const { minNights: min, maxNights: max } = rule;

  if (min !== null && max !== null) {
    return min === max ? t("nightsExact", { count: min }) : t("nightsRange", { min, max });
  }
  if (min !== null) return t("nightsFrom", { count: min });
  if (max !== null) return t("nightsUpTo", { count: max });

  return null;
}
