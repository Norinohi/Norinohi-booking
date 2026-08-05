import { type FiltersState, isSameValue } from "@/components/shared/form/filters";

import type { ResultsInput } from "../api/queries";

const FEET_TO_METRES = 0.3048;

export function toSearchInput(
  filters: FiltersState,
  defaults: FiltersState,
  opts: { sort: NonNullable<ResultsInput["sort"]>; page: number },
): ResultsInput {
  const input: ResultsInput = { currency: "EUR", sort: opts.sort, page: opts.page };

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
  input.dateFlexibility = filters.dateFlexibility as ResultsInput["dateFlexibility"];

  const active = (key: keyof FiltersState) => !isSameValue(filters[key], defaults[key]);

  if (active("length")) {
    input.minLength = filters.length[0] * FEET_TO_METRES;
    input.maxLength = filters.length[1] * FEET_TO_METRES;
  }
  if (active("cabins")) {
    input.minCabins = filters.cabins[0];
    input.maxCabins = filters.cabins[1];
  }
  if (active("berths")) {
    input.minBerths = filters.berths[0];
    input.maxBerths = filters.berths[1];
  }
  if (active("bathrooms")) {
    input.minBathrooms = filters.bathrooms[0];
    input.maxBathrooms = filters.bathrooms[1];
  }
  if (active("price")) {
    input.minPriceMinor = filters.price[0] * 100;
    input.maxPriceMinor = filters.price[1] * 100;
  }
  if (active("boatAge")) {
    input.minBoatAge = filters.boatAge[0];
    input.maxBoatAge = filters.boatAge[1];
  }
  if (active("guestRating")) {
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
