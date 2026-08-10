"use client";

import { useLocale } from "next-intl";

import type { FiltersState } from "@/components/shared/form/filters";

import type { ResultsInput } from "../api/queries";
import { toSearchInput } from "../lib/to-search-input";

/**
 * The single search-input build behind every results read — the search list, the map list and the
 * map markers.
 *
 * All three feed `toSearchInput`, and all three have to stamp the active locale onto it or they
 * drift onto different query keys and render cards in the wrong language. Reading `useLocale()` here
 * — once — is what stops one call site forgetting it, the same reason `useFacets` owns the facets
 * read rather than each control.
 *
 * Deliberately not exported from the barrel: it is the feature's shared internal, not public surface.
 */
export function useSearchInput(
  filters: FiltersState,
  defaults: FiltersState,
  opts: Omit<Parameters<typeof toSearchInput>[2], "locale">,
): ResultsInput {
  const locale = useLocale();

  return toSearchInput(filters, defaults, { ...opts, locale });
}
