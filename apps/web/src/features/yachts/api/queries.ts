import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import { keepPreviousData } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

export type ResultsInput = Parameters<AppRouterClient["charterSearch"]["results"]>[0];

export const resultsQueryOptions = (input: ResultsInput) =>
  orpc.charterSearch.results.queryOptions({ input });

export type Suggestion = Awaited<
  ReturnType<AppRouterClient["charterSearch"]["suggestions"]>
>[number];

/**
 * Destination typeahead behind the search bar's Location field. Fires on the empty query too, where
 * the server answers with the most-stocked countries as default suggestions.
 */
export const suggestionsQueryOptions = (query: string) =>
  orpc.charterSearch.suggestions.queryOptions({
    input: { query },
    staleTime: 5 * 60 * 1000,
    // Keep the current list on screen while the next query loads, so switching queries never flashes
    // the "no matches" empty state between the old and new results.
    placeholderData: keepPreviousData,
  });

export type MarkersInput = Parameters<AppRouterClient["charterSearch"]["mapMarkers"]>[0];

export type MapMarkerData = Awaited<
  ReturnType<AppRouterClient["charterSearch"]["mapMarkers"]>
>["markers"][number];

export const mapMarkersQueryOptions = (input: MarkersInput) =>
  orpc.charterSearch.mapMarkers.queryOptions({ input });

/** Matches the `hours` tier the server caches this on, so hydration does not immediately refetch. */
const ONE_HOUR = 60 * 60 * 1000;

export const listingDetailQueryOptions = (id: string) =>
  orpc.listings.get.queryOptions({ input: { id }, staleTime: ONE_HOUR });

/**
 * Counts this visitor against the listing for today. Fire-and-forget: the detail page
 * does not read the result, and a failed count must never surface to the visitor.
 */
export const recordListingViewMutationOptions = () => orpc.listings.recordView.mutationOptions();
