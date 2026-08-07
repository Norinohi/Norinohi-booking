"use client";

import { useQuery } from "@tanstack/react-query";

import type { Option } from "../lib/options";
import { facetsQueryOptions } from "../api/queries";

export type FilterOptions = {
  countries: Option[];
  sailingAreas: Option[];
  charterCompanies: Option[];
  marinas: Option[];
  durations: Option[];
  dateFlexibility: Option[];
  boatTypes: Option[];
  models: Option[];
  crews: Option[];
  mainsailTypes: Option[];
  equipment: Option[];
  lengthUnits: Option[];
  years: Option[];
};

/*
 * The shape a filter-driven control renders before facets arrive. Exported so a Suspense
 * fallback can render the SAME component in its empty state rather than a hand-built skeleton
 * that would drift as the control changes.
 */
export const EMPTY_OPTIONS: FilterOptions = {
  countries: [],
  sailingAreas: [],
  charterCompanies: [],
  marinas: [],
  durations: [],
  dateFlexibility: [],
  boatTypes: [],
  models: [],
  crews: [],
  mainsailTypes: [],
  equipment: [],
  lengthUnits: [],
  years: [],
};

export function useFilterOptions() {
  const query = useQuery(facetsQueryOptions());
  return { ...query, options: query.data?.options ?? EMPTY_OPTIONS };
}
