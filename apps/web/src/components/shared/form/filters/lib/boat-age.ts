import type { FilterRanges, FiltersState, Range } from "./state";

/*
 * Boat age and build year are one constraint shown two ways: the Boat Age slider and the
 * Year From / Year To selects. The selects are the state (`yearFrom` / `yearTo`); the slider is a
 * view over them, so moving either moves the other and nothing is stored twice.
 *
 * age = currentYear − buildYear, so the older bound (`yearFrom`) is the slider's upper thumb and
 * the newer bound (`yearTo`) its lower one. "any" sits on the slider's end, and a thumb pushed to
 * the end writes "any" back — a cleared select and a thumb at its limit read the same.
 *
 * "Now" is anchored on the facets rather than the clock: the server derives the age range from
 * the build years with its own clock, so `year.min + boatAge.max` is exactly its current year and
 * the slider's ends land on the oldest and newest build year it reported. A client clock can be a
 * year off across New Year (or between server render and hydration) and would put them one step
 * beside the ends.
 */
export type YearBounds = Pick<FiltersState, "yearFrom" | "yearTo">;
export type BoatAgeLimits = Pick<FilterRanges, "boatAge" | "year">;

function currentYear({ boatAge, year }: BoatAgeLimits): number {
  return year[0] + boatAge[1];
}

const YEAR = /^\d{4}$/;

/* A bound arrives from the URL as any string; only a four-digit year has a place on the slider. */
function yearOf(bound: string): number | null {
  return YEAR.test(bound) ? Number(bound) : null;
}

export function toAgeRange(bounds: YearBounds, limits: BoatAgeLimits): Range {
  const [minAge, maxAge] = limits.boatAge;
  const now = currentYear(limits);
  const clamp = (age: number) => Math.min(Math.max(age, minAge), maxAge);
  const from = yearOf(bounds.yearFrom);
  const to = yearOf(bounds.yearTo);
  const oldest = from === null ? maxAge : clamp(now - from);
  const newest = to === null ? minAge : clamp(now - to);
  // A crossed pair (a hand-edited URL) still has to render its two thumbs in order.
  return newest <= oldest ? [newest, oldest] : [oldest, newest];
}

/*
 * The slider moved. Only the thumb that moved rewrites its bound: the other keeps the exact value
 * it had — an explicit "2025" on the newest year is not turned into "any" just because the older
 * thumb was dragged, and a year the list does not hold survives being clamped onto the end.
 */
export function withAgeRange(
  bounds: YearBounds,
  [newest, oldest]: Range,
  limits: BoatAgeLimits,
): YearBounds {
  const [minAge, maxAge] = limits.boatAge;
  const [wasNewest, wasOldest] = toAgeRange(bounds, limits);
  const now = currentYear(limits);
  return {
    yearFrom:
      oldest === wasOldest ? bounds.yearFrom : oldest >= maxAge ? "any" : String(now - oldest),
    yearTo: newest === wasNewest ? bounds.yearTo : newest <= minAge ? "any" : String(now - newest),
  };
}

function crossed(yearFrom: string, yearTo: string): boolean {
  const from = yearOf(yearFrom);
  const to = yearOf(yearTo);
  return from !== null && to !== null && from > to;
}

/*
 * One select changed. Like the slider's thumbs the bounds cannot cross: a "from" chosen past the
 * current "to" (or the reverse) brings the other bound along to meet it, so what was just picked
 * is what stays on screen.
 */
export function withYearFrom(bounds: YearBounds, yearFrom: string): YearBounds {
  return { yearFrom, yearTo: crossed(yearFrom, bounds.yearTo) ? yearFrom : bounds.yearTo };
}

export function withYearTo(bounds: YearBounds, yearTo: string): YearBounds {
  return { yearFrom: crossed(bounds.yearFrom, yearTo) ? yearTo : bounds.yearFrom, yearTo };
}
