import { TZDate } from "@date-fns/tz";
import { addDays as addDaysFn, differenceInCalendarDays, format, parseISO } from "date-fns";

const DAY_FORMAT = "d MMMM yyyy";
const TIME_FORMAT = "HH:mm";
const DAY_KEY = "yyyy-MM-dd";

/** "2026-07-07" → "7 July 2026" */
export function formatDay(day: string): string {
  return format(parseISO(day), DAY_FORMAT);
}

/** An instant rendered on the marina's wall clock, never the visitor's. */
export function formatInstant(at: string, timeZone: string): { date: string; time: string } {
  const zoned = new TZDate(at, timeZone);
  return { date: format(zoned, DAY_FORMAT), time: format(zoned, TIME_FORMAT) };
}

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
