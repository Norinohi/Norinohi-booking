import type { AppRouterClient } from "@yacht-charter/api/routers/index";

import { orpc } from "@/utils/orpc";

export type ResultsInput = Parameters<AppRouterClient["charterSearch"]["results"]>[0];

export const resultsQueryOptions = (input: ResultsInput) =>
  orpc.charterSearch.results.queryOptions({ input });

export type Suggestion = Awaited<
  ReturnType<AppRouterClient["charterSearch"]["suggestions"]>
>[number];

/** Destination typeahead behind the search bar's Location field; idle until the first character. */
export const suggestionsQueryOptions = (query: string) =>
  orpc.charterSearch.suggestions.queryOptions({
    input: { query },
    enabled: query.trim().length >= 1,
    staleTime: 5 * 60 * 1000,
  });

export type MarkersInput = Parameters<AppRouterClient["charterSearch"]["mapMarkers"]>[0];

export const mapMarkersQueryOptions = (input: MarkersInput) =>
  orpc.charterSearch.mapMarkers.queryOptions({ input });

/** Matches the `hours` tier the server caches this on, so hydration does not immediately refetch. */
const ONE_HOUR = 60 * 60 * 1000;

export const listingDetailQueryOptions = (id: string) =>
  orpc.listings.get.queryOptions({ input: { id }, staleTime: ONE_HOUR });
