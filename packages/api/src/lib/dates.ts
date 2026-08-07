/**
 * Nights between two calendar dates, or null when either is missing, unparseable
 * or the range is not positive. Parsed as UTC midnight so a server in any zone
 * counts the same nights.
 *
 * Null rather than 0 for an empty range because every caller falls back to
 * another source for the period, and 0 would be a legitimate-looking answer.
 */
export function daysBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null;

  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return days > 0 ? days : null;
}

export type CharterPeriod = {
  checkIn: string | undefined;
  checkOut: string | undefined;
  duration: number | undefined;
};

/**
 * Resolves the charter period a search is really for. The UI offers it two ways
 * — an explicit check-in/check-out pair, or a start date plus a night count —
 * and the read model only understands the pair. The inverse of daysBetween().
 *
 * An explicit pair wins. A start date with no duration cannot be turned into a
 * range, so the duration is passed through for the caller to fall back on.
 */
export function effectivePeriod(input: {
  checkIn?: string;
  checkOut?: string;
  startDate?: string;
  duration?: number;
}): CharterPeriod {
  if (input.checkIn && input.checkOut) {
    return { checkIn: input.checkIn, checkOut: input.checkOut, duration: undefined };
  }

  if (input.startDate && input.duration) {
    const end = new Date(`${input.startDate}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + input.duration);
    return {
      checkIn: input.startDate,
      checkOut: end.toISOString().slice(0, 10),
      duration: input.duration,
    };
  }

  return { checkIn: undefined, checkOut: undefined, duration: input.duration };
}
