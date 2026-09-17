/**
 * The marina's wall-clock handover off a booking's `checkIn`/`checkOut`, or null.
 *
 * Those are a charter day with the time pinned to UTC by `combine` in the API's booking service,
 * which writes midnight where nothing was recorded; no charter hands over at 00:00, so that reads
 * as no time rather than as one.
 */
export function handoverTime(stamp: string): string | null {
  const time = stamp.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(time) && time !== "00:00" ? time : null;
}

/** A formatted charter day with its handover time beside it, where there is one. */
export function dayWithHandover(day: string, time: string | null | undefined): string {
  return time ? `${day}, ${time}` : day;
}

/** "14 Nov 2026, 17:00 → 21 Nov 2026, 09:00" off a booking's two charter stamps. */
export function charterRange(
  day: (stamp: string) => string,
  checkIn: string,
  checkOut: string,
): string {
  const end = (stamp: string) => dayWithHandover(day(stamp), handoverTime(stamp));
  return `${end(checkIn)} → ${end(checkOut)}`;
}
