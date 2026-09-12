import { DEFAULT_FILTERS, type FiltersState, isSameValue, YEAR_KEYS } from "./state";

export type FilterChip = { id: ChipId; label: string; keys: (keyof FiltersState)[] };

/*
 * Which state keys each chip stands for. Labels are built in `useFilterChips` — they need the
 * active locale, which a plain module cannot reach.
 */
export const CHIP_DEFS = [
  /* Only ever active while the free-text field is switched on, which is where it is written. */
  { id: "name", keys: ["name"] },
  { id: "guests", keys: ["guests"] },
  { id: "minBerths", keys: ["minBerths"] },
  { id: "country", keys: ["country"] },
  { id: "sailingArea", keys: ["sailingArea"] },
  { id: "city", keys: ["city"] },
  { id: "charterCompany", keys: ["charterCompany"] },
  { id: "marina", keys: ["marina"] },

  { id: "startDate", keys: ["startDate"] },
  { id: "duration", keys: ["duration"] },
  { id: "dateFlexibility", keys: ["dateFlexibility"] },

  { id: "boatType", keys: ["boatType"] },
  { id: "builder", keys: ["builder"] },
  { id: "model", keys: ["model"] },
  { id: "crew", keys: ["crew"] },
  { id: "mainsailType", keys: ["mainsailType"] },
  { id: "equipment", keys: ["equipment"] },

  { id: "length", keys: ["length"] },
  { id: "cabins", keys: ["cabins"] },
  { id: "berths", keys: ["berths"] },
  { id: "bathrooms", keys: ["bathrooms"] },
  { id: "price", keys: ["price"] },
  /* Also the Boat Age slider's chip: the slider edits these two keys (lib/boat-age.ts). */
  { id: "year", keys: YEAR_KEYS },

  { id: "underTemporaryBooking", keys: ["underTemporaryBooking"] },
  { id: "depositInsurance", keys: ["depositInsurance"] },
  { id: "petsAllowed", keys: ["petsAllowed"] },
  { id: "bestValue", keys: ["bestValue"] },

  { id: "guestRating", keys: ["guestRating"] },
] as const satisfies readonly { id: string; keys: readonly (keyof FiltersState)[] }[];

export type ChipId = (typeof CHIP_DEFS)[number]["id"];

export function isFilterKeyActive(
  state: FiltersState,
  key: keyof FiltersState,
  defaults: FiltersState = DEFAULT_FILTERS,
): boolean {
  return !isSameValue(state[key], defaults[key]);
}

/*
 * A key-by-key copy through a type parameter. Writing `next[key] = defaults[key]` inline fails:
 * with `key` a union, TypeScript demands a value valid for every member of it at once.
 */
function restoreKey<TKey extends keyof FiltersState>(
  target: FiltersState,
  key: TKey,
  value: FiltersState[TKey],
): void {
  target[key] = value;
}

export function clearFilterKeys(
  state: FiltersState,
  keys: (keyof FiltersState)[],
  defaults: FiltersState = DEFAULT_FILTERS,
): FiltersState {
  const next = { ...state };
  for (const key of keys) {
    restoreKey(next, key, defaults[key]);
  }
  return next;
}
