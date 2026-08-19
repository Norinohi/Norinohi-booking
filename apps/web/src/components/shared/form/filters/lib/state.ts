export type Range = [number, number];

export type FiltersState = {
  /** Free-text destination search, matched server-side against country/region/location/base. */
  query: string;
  country: string[];
  sailingArea: string[];
  /** Town, from a catalogue page's path. No control of its own; it arrives locked. */
  city: string[];
  charterCompany: string[];
  marina: string[];

  /** Plain calendar day, "2026-07-07". */
  startDate: string | null;
  duration: string;
  dateFlexibility: string;

  boatType: string[];
  /** Yacht builder. Arrives locked from a `/shipyard` page; no control of its own. */
  builder: string[];
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
  city: [],
  charterCompany: [],
  marina: [],

  startDate: null,
  duration: "7",
  dateFlexibility: "on-day",

  boatType: [],
  builder: [],
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

/** The place keys a Where control narrows its own option list by. */
const SCOPE_KEYS = ["country", "sailingArea", "city", "charterCompany", "marina"] as const;

export type FacetScope = Partial<Pick<FiltersState, (typeof SCOPE_KEYS)[number]>>;

/**
 * The place a facet list should be read within.
 *
 * `charterSearch.facets` already narrows every group by the input it is given and skips the
 * group's own key, so handing it the selected country returns the regions of that country and
 * still the full country list. Nothing here reaches the results — this is what the option lists
 * are read against, not what is searched.
 *
 * Empty selections are dropped rather than sent as `[]`, so an untouched panel asks the exact
 * input the route prefetched and hydrates instead of fetching a second time.
 *
 * Takes a partial state so a catalog route can hand it the facet its path pins, which is the same
 * shape without the rest of the panel around it.
 */
export function facetScopeOf(filters: FacetScope): FacetScope {
  const scope: FacetScope = {};
  for (const key of SCOPE_KEYS) {
    if (filters[key]?.length) scope[key] = filters[key];
  }
  return scope;
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
