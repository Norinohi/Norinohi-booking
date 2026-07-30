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

/*
 * A plain day is not an instant, so it must not be shifted by anyone's offset. Anchoring it at
 * UTC and rendering it with `formats.dateTime.day` (also UTC) keeps "2026-07-07" on the 7th for
 * every reader, and keeps server and client agreeing across a hydration boundary.
 */
export function dayToDisplay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1));
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
