import type { MapRoute } from "../api/queries";

export const ROUTE_LEVELS = ["easy", "moderate", "advanced"] as const;
export type RouteLevel = (typeof ROUTE_LEVELS)[number];

/*
 * Lengths as the visitor thinks of them, not every night count an author happened to write: a
 * 10-night route belongs with the long ones rather than in a bucket of its own.
 */
export const ROUTE_LENGTHS = ["short", "week", "long"] as const;
export type RouteLength = (typeof ROUTE_LENGTHS)[number];

export function lengthOf(nights: number): RouteLength {
  if (nights < 7) return "short";
  if (nights === 7) return "week";
  return "long";
}

export type RouteFilters = {
  q: string;
  country: string | null;
  length: RouteLength | null;
  level: RouteLevel | null;
};

/* Case and accents folded, so "sibenik" finds "Šibenik". */
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();

export function matchesFilters(route: MapRoute, filters: RouteFilters): boolean {
  if (filters.country && route.countryValue !== filters.country) return false;
  if (filters.length && lengthOf(route.nights) !== filters.length) return false;
  if (filters.level && route.difficulty !== filters.level) return false;

  const query = fold(filters.q.trim());
  if (!query) return true;
  /* The stops too: someone looking for Hvar wants the routes that call there, not only the ones
     named after it. */
  const haystack = [route.title, route.placeLabel, ...route.stops.map((stop) => stop.name)];
  return haystack.some((text) => fold(text).includes(query));
}

/** The countries the routes are in, labelled in the page's language, alphabetically. */
export function countryOptions(routes: MapRoute[]): { value: string; label: string }[] {
  const byValue = new Map<string, string>();
  for (const route of routes) {
    if (route.countryValue && !byValue.has(route.countryValue)) {
      byValue.set(route.countryValue, route.countryLabel ?? route.countryValue);
    }
  }
  return [...byValue]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
