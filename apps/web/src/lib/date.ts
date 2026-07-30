import { addDays as addDaysFn, differenceInCalendarDays, format, parseISO } from "date-fns";

const DAY_KEY = "yyyy-MM-dd";

/*
 * Calendar-day arithmetic only. Anything user-facing is formatted through next-intl's
 * `useFormatter`, so display stays tied to the active locale.
 */

/** Bridge to the Calendar primitive, which is deliberately native-Date only. */
export function dayToNative(day: string | null): Date | undefined {
  return day ? parseISO(day) : undefined;
}

export function dayFromNative(date: Date): string {
  return format(date, DAY_KEY);
}

/** Whole days between two calendar days, ignoring any clock time. */
export function daysBetween(from: Date, to: Date): number {
  return differenceInCalendarDays(to, from);
}

export function addDays(day: string, days: number): string {
  return format(addDaysFn(parseISO(day), days), DAY_KEY);
}
