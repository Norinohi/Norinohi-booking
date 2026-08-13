export type Range = [number, number];

export type FiltersState = {
  /** Free-text destination search, matched server-side against country/region/location/base. */
  query: string;
  country: string[];
  sailingArea: string[];
  charterCompany: string[];
  marina: string[];

  /** Plain calendar day, "2026-07-07". */
  startDate: string | null;
  duration: string;
  dateFlexibility: string;

  boatType: string[];
  model: string[];
  crew: string[];
  mainsailType: string[];
  equipment: string[];

  length: Range;
  cabins: Range;
  berths: Range;
  bathrooms: Range;
  price: Range;
  boatAge: Range;
  yearFrom: string;
  yearTo: string;

  withoutAvailabilityConfirmation: boolean;
  underTemporaryBooking: boolean;
  depositInsurance: boolean;
  petsAllowed: boolean;

  guestRating: Range;
};

export type FilterRanges = {
  length: Range;
  cabins: Range;
  berths: Range;
  bathrooms: Range;
  price: Range;
  boatAge: Range;
  guestRating: Range;
};

const EMPTY_RANGE: Range = [0, 0];

export const EMPTY_RANGES: FilterRanges = {
  length: EMPTY_RANGE,
  cabins: EMPTY_RANGE,
  berths: EMPTY_RANGE,
  bathrooms: EMPTY_RANGE,
  price: EMPTY_RANGE,
  boatAge: EMPTY_RANGE,
  guestRating: EMPTY_RANGE,
};

export const DEFAULT_FILTERS: FiltersState = {
  query: "",
  country: [],
  sailingArea: [],
  charterCompany: [],
  marina: [],

  startDate: null,
  duration: "7",
  dateFlexibility: "on-day",

  boatType: [],
  model: [],
  crew: [],
  mainsailType: [],
  equipment: [],

  length: EMPTY_RANGE,
  cabins: EMPTY_RANGE,
  berths: EMPTY_RANGE,
  bathrooms: EMPTY_RANGE,
  price: EMPTY_RANGE,
  boatAge: EMPTY_RANGE,
  yearFrom: "any",
  yearTo: "any",

  withoutAvailabilityConfirmation: false,
  underTemporaryBooking: false,
  depositInsurance: false,
  petsAllowed: false,

  guestRating: EMPTY_RANGE,
};

export function buildDefaultFilters(ranges: FilterRanges): FiltersState {
  return { ...DEFAULT_FILTERS, ...ranges };
}

export type FilterValue = FiltersState[keyof FiltersState];

export function isSameValue(a: FilterValue, b: FilterValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  return a === b;
}

export function countActiveFilters(
  state: FiltersState,
  defaults: FiltersState = DEFAULT_FILTERS,
): number {
  // SAFETY: the keys come from DEFAULT_FILTERS, which is a complete FiltersState, so each one
  // is a key of it; Object.keys only ever reports them as bare strings.
  const keys = Object.keys(DEFAULT_FILTERS) as (keyof FiltersState)[];
  return keys.filter((key) => !isSameValue(state[key], defaults[key])).length;
}
