import { DEFAULT_FILTERS, type FiltersState, isSameValue } from "./state";

export type FilterChip = { id: ChipId; label: string; keys: (keyof FiltersState)[] };

/*
 * Which state keys each chip stands for. Labels are built in `useFilterChips` — they need the
 * active locale, which a plain module cannot reach.
 */
export const CHIP_DEFS = [
  { id: "country", keys: ["country"] },
  { id: "sailingArea", keys: ["sailingArea"] },
  { id: "charterCompany", keys: ["charterCompany"] },
  { id: "marina", keys: ["marina"] },

  { id: "startDate", keys: ["startDate"] },
  { id: "duration", keys: ["duration"] },
  { id: "dateFlexibility", keys: ["dateFlexibility"] },

  { id: "boatType", keys: ["boatType"] },
  { id: "model", keys: ["model"] },
  { id: "crew", keys: ["crew"] },
  { id: "mainsailType", keys: ["mainsailType"] },
  { id: "equipment", keys: ["equipment"] },

  { id: "length", keys: ["length"] },
  { id: "cabins", keys: ["cabins"] },
  { id: "berths", keys: ["berths"] },
  { id: "bathrooms", keys: ["bathrooms"] },
  { id: "price", keys: ["price"] },
  { id: "boatAge", keys: ["boatAge"] },
  { id: "year", keys: ["yearFrom", "yearTo"] },

  { id: "withoutAvailabilityConfirmation", keys: ["withoutAvailabilityConfirmation"] },
  { id: "underTemporaryBooking", keys: ["underTemporaryBooking"] },
  { id: "depositInsurance", keys: ["depositInsurance"] },
  { id: "petsAllowed", keys: ["petsAllowed"] },

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

export function clearFilterKeys(
  state: FiltersState,
  keys: (keyof FiltersState)[],
  defaults: FiltersState = DEFAULT_FILTERS,
): FiltersState {
  const next = { ...state };
  for (const key of keys) {
    (next as Record<string, unknown>)[key] = defaults[key];
  }
  return next;
}
