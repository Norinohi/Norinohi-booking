"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { facetsQueryOptions } from "../api/queries";

/**
 * The single facets read behind every filter control.
 *
 * `useFilterOptions` and `useFilterRanges` select different slices of the same response, and both
 * have to ask for it in the active locale. Asking through one hook is what stops them drifting onto
 * two query keys — one localized call site and one that forgot would fetch the taxonomy twice and
 * render half the filters in the wrong language.
 *
 * Deliberately not exported from the barrel: it is the shared internal, not part of the surface a
 * filter control consumes.
 */
export function useFacets() {
  const locale = useLocale();

  return useQuery(facetsQueryOptions(locale));
}
