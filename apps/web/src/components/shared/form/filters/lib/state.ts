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
  /** Nights as a string, or "any" when the visitor has not named a length. */
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
  /**
   * Build-year bounds, "any" or a four-digit year. Also what the Boat Age slider edits: age and
   * build year are one constraint shown two ways, and keeping only the years means a URL, a chip
   * and a search request each carry it once — see `lib/boat-age.ts` for the mapping.
   */
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
  guestRating: Range;
  /** Slider limits only — not filter values; the state keeps `yearFrom` / `yearTo`. */
  boatAge: Range;
  /** Oldest and newest build year behind `boatAge`; anchors the age ↔ year mapping. */
  year: Range;
};

const EMPTY_RANGE: Range = [0, 0];

export const EMPTY_RANGES: FilterRanges = {
  length: EMPTY_RANGE,
  cabins: EMPTY_RANGE,
  berths: EMPTY_RANGE,
  bathrooms: EMPTY_RANGE,
  price: EMPTY_RANGE,
  guestRating: EMPTY_RANGE,
  boatAge: EMPTY_RANGE,
  year: EMPTY_RANGE,
};

export const DEFAULT_FILTERS: FiltersState = {
  query: "",
  country: [],
  sailingArea: [],
  city: [],
  charterCompany: [],
  marina: [],

  startDate: null,
  duration: "any",
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
  yearFrom: "any",
  yearTo: "any",

  withoutAvailabilityConfirmation: false,
  underTemporaryBooking: false,
  depositInsurance: false,
  petsAllowed: false,

  guestRating: EMPTY_RANGE,
};

/* Picked by name: `boatAge` and `year` bound the slider but are not filter values. */
export function buildDefaultFilters(ranges: FilterRanges): FiltersState {
  const { length, cabins, berths, bathrooms, price, guestRating } = ranges;
  return { ...DEFAULT_FILTERS, length, cabins, berths, bathrooms, price, guestRating };
}

/*
 * One filter shown through two keys: the Boat Age slider edits both, so they are one chip and
 * one unit in the active count, the same as any single-key filter.
 */
export const YEAR_KEYS = ["yearFrom", "yearTo"] as const satisfies readonly (keyof FiltersState)[];

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
  const isActive = (key: keyof FiltersState) =>
    /* Flexibility widens a start date; with no date it narrows nothing, so it counts for nothing. */
    key === "dateFlexibility" && state.startDate === null
      ? false
      : !isSameValue(state[key], defaults[key]);
  const isYearKey = (key: keyof FiltersState) => YEAR_KEYS.some((yearKey) => yearKey === key);
  const singles = keys.filter((key) => !isYearKey(key) && isActive(key)).length;
  return singles + (YEAR_KEYS.some(isActive) ? 1 : 0);
}
