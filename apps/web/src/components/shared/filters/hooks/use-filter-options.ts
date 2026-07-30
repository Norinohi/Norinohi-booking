"use client";

import { useTranslations } from "next-intl";

import {
  BOAT_TYPES,
  CHARTER_COMPANIES,
  COUNTRIES,
  CREWS,
  DATE_FLEXIBILITY,
  DURATIONS,
  EQUIPMENT,
  LENGTH_UNITS,
  MAINSAIL_TYPES,
  MARINAS,
  MODELS,
  type Option,
  type OptionKey,
  SAILING_AREAS,
  YEARS,
} from "../lib/options";

/** Pairs each stable option value with its label for the active locale. */
export function useFilterOptions() {
  const t = useTranslations("Filters.options");
  const build = (keys: readonly OptionKey[]): Option[] =>
    keys.map((value) => ({ value, label: t(value) }));

  return {
    countries: build(COUNTRIES),
    sailingAreas: build(SAILING_AREAS),
    charterCompanies: build(CHARTER_COMPANIES),
    marinas: build(MARINAS),
    durations: build(DURATIONS),
    dateFlexibility: build(DATE_FLEXIBILITY),
    boatTypes: build(BOAT_TYPES),
    models: build(MODELS),
    crews: build(CREWS),
    mainsailTypes: build(MAINSAIL_TYPES),
    equipment: build(EQUIPMENT),
    lengthUnits: build(LENGTH_UNITS),
    years: build(YEARS),
  };
}
