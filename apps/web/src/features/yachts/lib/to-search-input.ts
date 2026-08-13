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

  if (filters.country.length) input.country = filters.country;
  if (filters.sailingArea.length) input.sailingArea = filters.sailingArea;
  if (filters.charterCompany.length) input.charterCompany = filters.charterCompany;
  if (filters.marina.length) input.marina = filters.marina;
  if (filters.boatType.length) input.boatType = filters.boatType;
  if (filters.model.length) input.model = filters.model;
  if (filters.crew.length) input.crew = filters.crew;
  if (filters.mainsailType.length) input.mainsailType = filters.mainsailType;
  if (filters.equipment.length) input.equipment = filters.equipment;

  if (filters.startDate) input.startDate = filters.startDate;
  input.duration = Number(filters.duration);
  input.dateFlexibility = DATE_FLEXIBILITY.find((option) => option === filters.dateFlexibility);

  const isActive = (key: keyof FiltersState) => !isSameValue(filters[key], defaults[key]);

  if (isActive("length")) {
    input.minLength = filters.length[0] * FEET_TO_METRES;
    input.maxLength = filters.length[1] * FEET_TO_METRES;
  }
  if (isActive("cabins")) {
    input.minCabins = filters.cabins[0];
    input.maxCabins = filters.cabins[1];
  }
  if (isActive("berths")) {
    input.minBerths = filters.berths[0];
    input.maxBerths = filters.berths[1];
  }
  if (isActive("bathrooms")) {
    input.minBathrooms = filters.bathrooms[0];
    input.maxBathrooms = filters.bathrooms[1];
  }
  if (isActive("price")) {
    input.minPriceMinor = filters.price[0] * 100;
    input.maxPriceMinor = filters.price[1] * 100;
  }
  if (isActive("boatAge")) {
    input.minBoatAge = filters.boatAge[0];
    input.maxBoatAge = filters.boatAge[1];
  }
  if (isActive("guestRating")) {
    input.minGuestRating = filters.guestRating[0];
    input.maxGuestRating = filters.guestRating[1];
  }

  if (filters.yearFrom !== "any") input.yearFrom = Number(filters.yearFrom);
  if (filters.yearTo !== "any") input.yearTo = Number(filters.yearTo);

  if (filters.withoutAvailabilityConfirmation) input.withoutAvailabilityConfirmation = true;
  if (filters.underTemporaryBooking) input.underTemporaryBooking = true;
  if (filters.depositInsurance) input.depositInsurance = true;
  if (filters.petsAllowed) input.petsAllowed = true;

  return input;
}
