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

/**
 * The same calendar day this many months earlier, or null when the date does not
 * parse. Clamped rather than overflowed: two months before 30 April is 28
 * February, not 2 March, because a window that quietly grows is one we would
 * discover by underbilling.
 *
 * Accepts a `yyyy-MM-dd` prefix, so a provider that returns a full datetime for
 * a period boundary is handled without a second parse at every call site.
 * `ProviderQuote.checkIn` is typed as a bare string, so that does happen.
 */
export function monthsBefore(date: string, months: number): string | null {
  const at = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime())) return null;

  const dayOfMonth = at.getUTCDate();
  const shifted = new Date(at);
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() - months);

  const lastOfTarget = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  shifted.setUTCDate(Math.min(dayOfMonth, lastOfTarget));

  return shifted.toISOString().slice(0, 10);
}

/**
 * The calendar day this many days earlier, or null when the date does not parse.
 * Accepts a `yyyy-MM-dd` prefix for the same reason as `monthsBefore`.
 */
export function daysBefore(date: string, days: number): string | null {
  const at = new Date(`${date.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime())) return null;

  at.setUTCDate(at.getUTCDate() - days);
  return at.toISOString().slice(0, 10);
}
