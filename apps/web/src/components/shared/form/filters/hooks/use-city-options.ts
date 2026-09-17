"use client";

import { useQueries } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { citySuggestionsQueryOptions } from "../api/queries";
import type { Option } from "../lib/options";

/*
 * A city has no facet list, so its label used to be rebuilt from the URL slug and "Šibenik" came
 * back as "Sibenik". The typeahead already knows the spelling; this asks it for each picked city.
 */
export function useCityOptions(cities: readonly string[]): Option[] {
  const locale = useLocale();
  const results = useQueries({
    queries: cities.map((city) => citySuggestionsQueryOptions(city, locale)),
  });

  return results.flatMap((result, index) => {
    const match = result.data?.find(
      (suggestion) => suggestion.kind === "city" && suggestion.value === cities[index],
    );
    return match ? [{ value: match.value, label: match.label }] : [];
  });
}
