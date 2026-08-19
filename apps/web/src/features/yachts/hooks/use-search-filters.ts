"use client";

import { useQueryStates } from "nuqs";
import { useMemo } from "react";

import { type FiltersState, isSameValue, useFilterRanges } from "@/components/shared/form/filters";

import { filterParsers } from "../lib/search-params";

export function useSearchFilters() {
  const [raw, setRaw] = useQueryStates(filterParsers);
  const { defaults } = useFilterRanges();

  const filters = useMemo<FiltersState>(
    () => ({
      ...raw,
      length: raw.length ?? defaults.length,
      cabins: raw.cabins ?? defaults.cabins,
      berths: raw.berths ?? defaults.berths,
      bathrooms: raw.bathrooms ?? defaults.bathrooms,
      price: raw.price ?? defaults.price,
      guestRating: raw.guestRating ?? defaults.guestRating,
    }),
    [raw, defaults],
  );

  function setFilters(next: FiltersState) {
    setRaw({
      ...next,
      length: isSameValue(next.length, defaults.length) ? null : next.length,
      cabins: isSameValue(next.cabins, defaults.cabins) ? null : next.cabins,
      berths: isSameValue(next.berths, defaults.berths) ? null : next.berths,
      bathrooms: isSameValue(next.bathrooms, defaults.bathrooms) ? null : next.bathrooms,
      price: isSameValue(next.price, defaults.price) ? null : next.price,
      guestRating: isSameValue(next.guestRating, defaults.guestRating) ? null : next.guestRating,
    });
  }

  return { filters, setFilters, defaults };
}
