import { type FiltersState, isSameValue } from "@/components/shared/form/filters";

import type { Locale } from "@/i18n/config";

import type { ResultsInput } from "../api/queries";

const FEET_TO_METRES = 0.3048;

/* The filter state keeps flexibility as a plain string; only these reach the contract. */
const DATE_FLEXIBILITY: readonly NonNullable<ResultsInput["dateFlexibility"]>[] = [
  "on-day",
  "1-3-days",
  "1-week",
  "2-weeks",
  "1-month",
];

/*
 * `locale` is required rather than optional so a new call site cannot quietly omit it and get
 * English cards back: the server translates a card's category, crew, sail type, country, region,
 * location, marina and amenities off this field, and it is part of the query key, so a missing one
 * both mistranslates and splits the cache.
 */
export function toSearchInput(
  filters: FiltersState,
  defaults: FiltersState,
  opts: { sort: NonNullable<ResultsInput["sort"]>; page: number; locale: Locale },
): ResultsInput {
  const input: ResultsInput = {
    currency: "EUR",
    sort: opts.sort,
    page: opts.page,
    locale: opts.locale,
  };

  if (filters.query) input.query = filters.query;
  if (filters.country.length) input.country = filters.country;
  if (filters.sailingArea.length) input.sailingArea = filters.sailingArea;
  if (filters.city.length) input.city = filters.city;
  if (filters.charterCompany.length) input.charterCompany = filters.charterCompany;
  if (filters.marina.length) input.marina = filters.marina;
  if (filters.boatType.length) input.boatType = filters.boatType;
  if (filters.builder.length) input.builder = filters.builder;
  if (filters.model.length) input.model = filters.model;
  if (filters.crew.length) input.crew = filters.crew;
  if (filters.mainsailType.length) input.mainsailType = filters.mainsailType;
  if (filters.equipment.length) input.equipment = filters.equipment;

  if (filters.startDate) input.startDate = filters.startDate;
  /*
   * Only a length the visitor named. It used to default to seven and go out on every search,
   * so a plain browse was filtered by a week nobody asked for and no chip admitted to. A start
   * date with no length still narrows: the server spans a week from it for the free-period test
   * and leaves the check-in rules out of it.
   */
  if (filters.duration !== "any") input.duration = Number(filters.duration);
  /*
   * Flexibility is a width around the start date, so with no date there is nothing to widen and
   * sending it would only split the query cache. `useFilterChips` hides the chip on the same
   * condition, so the panel never claims a filter the results were not narrowed by.
   */
  if (filters.startDate) {
    input.dateFlexibility = DATE_FLEXIBILITY.find((option) => option === filters.dateFlexibility);
  }

  const isActive = (key: keyof FiltersState) => !isSameValue(filters[key], defaults[key]);

  /*
   * A thumb resting on the end of its slider is not a constraint, and sending it as one costs
   * the listing that sits exactly on the end: the sliders round to whole feet and whole euros,
   * and rounding the top bound down puts it under the boat that defined it. The longest hull in
   * the catalogue is 157.00 m, which renders as 515 ft and converts back to 156.97 m; the
   * dearest is 396,679.40, which renders as 396,679 and converts back to 396,679.00. Both
   * vanished from their own range as soon as the other thumb was moved.
   */
  const lowerOf = <
    TKey extends "length" | "cabins" | "berths" | "bathrooms" | "price" | "guestRating",
  >(
    key: TKey,
  ) => (filters[key][0] > defaults[key][0] ? filters[key][0] : undefined);
  const upperOf = <
    TKey extends "length" | "cabins" | "berths" | "bathrooms" | "price" | "guestRating",
  >(
    key: TKey,
  ) => (filters[key][1] < defaults[key][1] ? filters[key][1] : undefined);
  const scaled = (value: number | undefined, factor: number) =>
    value === undefined ? undefined : value * factor;

  if (isActive("length")) {
    input.minLength = scaled(lowerOf("length"), FEET_TO_METRES);
    input.maxLength = scaled(upperOf("length"), FEET_TO_METRES);
  }
  if (isActive("cabins")) {
    input.minCabins = lowerOf("cabins");
    input.maxCabins = upperOf("cabins");
  }
  if (isActive("berths")) {
    input.minBerths = lowerOf("berths");
    input.maxBerths = upperOf("berths");
  }
  if (isActive("bathrooms")) {
    input.minBathrooms = lowerOf("bathrooms");
    input.maxBathrooms = upperOf("bathrooms");
  }
  if (isActive("price")) {
    input.minPriceMinor = scaled(lowerOf("price"), 100);
    input.maxPriceMinor = scaled(upperOf("price"), 100);
  }
  if (isActive("guestRating")) {
    input.minGuestRating = lowerOf("guestRating");
    input.maxGuestRating = upperOf("guestRating");
  }

  /* The Boat Age slider edits these too, so `minBoatAge` / `maxBoatAge` are never sent alongside. */
  if (filters.yearFrom !== "any") input.yearFrom = Number(filters.yearFrom);
  if (filters.yearTo !== "any") input.yearTo = Number(filters.yearTo);

  if (filters.withoutAvailabilityConfirmation) input.withoutAvailabilityConfirmation = true;
  if (filters.underTemporaryBooking) input.underTemporaryBooking = true;
  if (filters.depositInsurance) input.depositInsurance = true;
  if (filters.petsAllowed) input.petsAllowed = true;

  return input;
}
