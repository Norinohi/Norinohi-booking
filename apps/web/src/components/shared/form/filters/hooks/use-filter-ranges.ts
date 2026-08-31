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

/**
 * `priceCurrency` rides along with the ranges because the price slider's ends come from the
 * facet query, and anything that prints them has to use the currency that query answered in.
 * Hardcoding one is how a euro sign ended up on a range whose ends were dollars.
 *
 * Undefined until the facets land, which `useMoney` reads as its own default.
 */
export function useFilterRanges(): {
  ranges: FilterRanges;
  defaults: FiltersState;
  priceCurrency: string | undefined;
} {
  const facets = useFacets().data;

  return useMemo(() => {
    const r = facets?.ranges;
    if (!r) {
      return {
        ranges: EMPTY_RANGES,
        defaults: buildDefaultFilters(EMPTY_RANGES),
        priceCurrency: undefined,
      };
    }

    const ranges: FilterRanges = {
      length: metresToFeet(r.length),
      cabins: asRange(r.cabins),
      berths: asRange(r.berths),
      bathrooms: asRange(r.bathrooms),
      price: [Math.round(r.price.minMinor / 100), Math.round(r.price.maxMinor / 100)],
      guestRating: asRange(r.guestRating),
      boatAge: asRange(r.boatAge),
      year: asRange(r.year),
    };
    return { ranges, defaults: buildDefaultFilters(ranges), priceCurrency: r.price.currency };
  }, [facets]);
}
