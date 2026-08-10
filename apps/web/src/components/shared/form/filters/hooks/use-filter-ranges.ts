"use client";

import { useMemo } from "react";

import { useFacets } from "./use-facets";
import {
  buildDefaultFilters,
  EMPTY_RANGES,
  type FilterRanges,
  type FiltersState,
  type Range,
} from "../lib/state";

const asRange = (bound: { min: number; max: number }): Range => [bound.min, bound.max];

const FEET_PER_METRE = 1 / 0.3048;
const metresToFeet = (bound: { min: number; max: number }): Range => [
  Math.round(bound.min * FEET_PER_METRE),
  Math.round(bound.max * FEET_PER_METRE),
];

export function useFilterRanges(): { ranges: FilterRanges; defaults: FiltersState } {
  const facets = useFacets().data;

  return useMemo(() => {
    const r = facets?.ranges;
    if (!r) return { ranges: EMPTY_RANGES, defaults: buildDefaultFilters(EMPTY_RANGES) };

    const ranges: FilterRanges = {
      length: metresToFeet(r.length),
      cabins: asRange(r.cabins),
      berths: asRange(r.berths),
      bathrooms: asRange(r.bathrooms),
      price: [Math.round(r.price.minMinor / 100), Math.round(r.price.maxMinor / 100)],
      boatAge: asRange(r.boatAge),
      guestRating: asRange(r.guestRating),
    };
    return { ranges, defaults: buildDefaultFilters(ranges) };
  }, [facets]);
}
