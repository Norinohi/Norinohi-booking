const CLOCK = /(?:^|[ T])(\d{1,2}):(\d{2})(?::\d{2})?$/;
/* The NauSYS PDF's own base example writes check-in as `"17"`. */
const BARE_HOUR = /^(\d{1,2})$/;

/**
 * The "HH:mm" a vendor wrote for a check-in or check-out, from any of the shapes they use:
 * NauSYS sends `"17:00"`, Booking Manager folds it into `"2026-11-14 17:00:00"`.
 *
 * Undefined when there is no clock at all, including a bare date: a charter day with no time is
 * the vendor saying nothing, and a midnight made up here would read as a real handover.
 */
export function wallClockTime(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  const hour = trimmed?.match(BARE_HOUR)?.[1];
  if (hour !== undefined) return Number(hour) > 23 ? undefined : `${hour.padStart(2, "0")}:00`;
  const match = trimmed?.match(CLOCK);
  if (!match?.[1] || !match[2]) return undefined;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}
