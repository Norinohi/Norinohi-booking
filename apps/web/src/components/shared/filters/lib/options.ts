/*
 * Option *values* only — they are persisted filter state, so they must never change with the UI
 * language. Labels come from the `Filters.options` namespace via `useFilterOptions`. Keys are
 * unique across every group, so one flat message namespace covers them all.
 */
export type Option = { value: string; label: string };

export function labelOf(options: Option[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/** Keeps a selection in option order, so comparing it against a default never depends on click order. */
export function orderedValues(options: Option[], selected: string[]): string[] {
  const picked = new Set(selected);
  return options.filter((option) => picked.has(option.value)).map((option) => option.value);
}

export const COUNTRIES = [
  "egypt",
  "morocco",
  "croatia",
  "spain",
  "france",
  "italy",
  "portugal",
  "greece",
  "norway",
  "turkey",
  "montenegro",
] as const;

export const SAILING_AREAS = ["dalmatia", "istria", "kvarner"] as const;

export const CHARTER_COMPANIES = ["sunsail", "dream-yacht", "navigare"] as const;

export const MARINAS = ["split", "kastela", "trogir"] as const;

export const DURATIONS = ["7", "3", "10", "14"] as const;

export const DATE_FLEXIBILITY = ["on-day", "1-3-days", "1-week", "2-weeks", "1-month"] as const;

export const BOAT_TYPES = [
  "sailing-yacht",
  "catamaran",
  "gulet",
  "motor-yacht",
  "power-catamaran",
  "sailboat",
  "motor-boat",
] as const;

export const MODELS = ["bavaria", "beneteau", "jeanneau", "lagoon"] as const;

export const CREWS = ["full-crew", "skipper", "bareboat"] as const;

export const MAINSAIL_TYPES = ["classic", "furling", "lazy-bag"] as const;

export const EQUIPMENT = ["air-conditioning", "generator", "bow-thruster", "wifi"] as const;

export const LENGTH_UNITS = ["ft", "m"] as const;

export const YEARS = ["any", "2015", "2018", "2020", "2022", "2024", "2025"] as const;

export type OptionKey =
  | (typeof COUNTRIES)[number]
  | (typeof SAILING_AREAS)[number]
  | (typeof CHARTER_COMPANIES)[number]
  | (typeof MARINAS)[number]
  | (typeof DURATIONS)[number]
  | (typeof DATE_FLEXIBILITY)[number]
  | (typeof BOAT_TYPES)[number]
  | (typeof MODELS)[number]
  | (typeof CREWS)[number]
  | (typeof MAINSAIL_TYPES)[number]
  | (typeof EQUIPMENT)[number]
  | (typeof LENGTH_UNITS)[number]
  | (typeof YEARS)[number];
