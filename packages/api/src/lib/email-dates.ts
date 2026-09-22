/*
 * Dates as the English email templates print them. Kept apart from the mail senders, which read
 * the environment at import, so a test can reach the formatting on its own.
 *
 * `Intl.DateTimeFormat` refuses `dateStyle`/`timeStyle` alongside any single field such as
 * `timeZoneName` and throws. Inside a best-effort sender that throw was caught and logged, so the
 * customer's copy of their question never went out while the staff alert beside it did. Every
 * field here is therefore spelled out.
 */
const LOCALE = "en";

/** A calendar day, "Oct 17, 2026". */
export function emailDay(date: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

/** To the minute and in UTC, "25 Sept 2026, 00:44 UTC": a hold lapses at an instant, and the
    mail cannot know the reader's zone. */
export function emailInstant(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}
