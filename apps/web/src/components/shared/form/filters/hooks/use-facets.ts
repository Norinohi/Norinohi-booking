"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { facetsQueryOptions } from "../api/queries";
import type { FacetScope } from "../lib/state";

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
 *
 * `scope` is opt-in per caller, and only the Where controls take it. `useFilterRanges` reads the
 * unscoped facets on purpose: the slider bounds it derives are also the panel's defaults, and
 * defaults that moved with the selected country would re-scale every slider and change what
 * "Apply Filters (N)" counts as set.
 *
 * A scope the browser has not asked for yet falls back to the unscoped taxonomy, which every route
 * prefetches and hydrates. Without it a filtered URL paints its Where controls empty until the
 * narrowed read lands — and a control with no options cannot render the values it already holds,
 * so a panel that knows it has two filters set would show four placeholders and read as if they
 * had been lost. The previous scope wins over it, so changing a country does not flash the global
 * list on the way to the narrower one.
 */
export function useFacets(scope?: FacetScope) {
  const locale = useLocale();
  const queryClient = useQueryClient();
  const unscopedKey = facetsQueryOptions(locale).queryKey;

  return useQuery({
    ...facetsQueryOptions(locale, scope),
    placeholderData: (previous) => previous ?? queryClient.getQueryData(unscopedKey),
  });
}
