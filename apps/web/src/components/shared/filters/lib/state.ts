export type Range = [number, number];

export type FiltersState = {
  country: string[];
  sailingArea: string[];
  charterCompany: string[];
  marina: string[];

  startDate: Date | null;
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

export const LENGTH_LIMITS: Range = [0, 120];
export const CABINS_LIMITS: Range = [0, 12];
export const BERTHS_LIMITS: Range = [0, 24];
export const BATHROOMS_LIMITS: Range = [0, 10];
export const PRICE_LIMITS: Range = [0, 50000];
export const BOAT_AGE_LIMITS: Range = [1, 20];
export const RATING_LIMITS: Range = [0, 5];

export const DEFAULT_FILTERS: FiltersState = {
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

  length: LENGTH_LIMITS,
  cabins: CABINS_LIMITS,
  berths: BERTHS_LIMITS,
  bathrooms: BATHROOMS_LIMITS,
  price: PRICE_LIMITS,
  boatAge: BOAT_AGE_LIMITS,
  yearFrom: "any",
  yearTo: "any",

  withoutAvailabilityConfirmation: false,
  underTemporaryBooking: false,
  depositInsurance: false,
  petsAllowed: false,

  guestRating: RATING_LIMITS,
};

export function isSameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

export function countActiveFilters(state: FiltersState): number {
  const keys = Object.keys(DEFAULT_FILTERS) as (keyof FiltersState)[];
  return keys.filter((key) => !isSameValue(state[key], DEFAULT_FILTERS[key])).length;
}
