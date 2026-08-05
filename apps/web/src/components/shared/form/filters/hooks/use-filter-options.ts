"use client";

import { useQuery } from "@tanstack/react-query";

import type { Option } from "../lib/options";
import { facetsQueryOptions } from "../api/queries";

type FilterOptions = {
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

const EMPTY_OPTIONS: FilterOptions = {
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
