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

export type MarinasInput = Parameters<AppRouterClient["charterSearch"]["mapMarinas"]>[0];

export type MapMarinaData = Awaited<
  ReturnType<AppRouterClient["charterSearch"]["mapMarinas"]>
>["marinas"][number];

/**
 * Every marina the current filters have a boat at, with how many.
 *
 * One row per place rather than per hull, so the whole catalogue fits in one answer and the count
 * on a pill is the real number. The boats themselves arrive only for the marina somebody opens —
 * see `marinaListingsQueryOptions`.
 */
export const mapMarinasQueryOptions = (input: MarinasInput) =>
  orpc.charterSearch.mapMarinas.queryOptions({ input });

/** How many cards a page of a marina's boats carries; the popup pages through them. */
export const MARINA_PAGE_SIZE = 20;

/**
 * One page of the boats lying under a pin, under the search's own filters.
 *
 * Takes every base the pin covers rather than one: two marinas can sit a stone's throw apart, close
 * enough that no zoom separates them, and the count on the pin is their sum. Asking for one of them
 * made the pager count to a smaller number than the pin had promised.
 *
 * `marina` matches a base by name *or* id, so the ids from the markers address them exactly.
 * Previous data is kept while the next page loads, so paging the card never blanks it.
 */
export const marinaListingsQueryOptions = (input: ResultsInput, baseIds: string[], page: number) =>
  orpc.charterSearch.results.queryOptions({
    input: { ...input, marina: baseIds, page, pageSize: MARINA_PAGE_SIZE },
    placeholderData: keepPreviousData,
  });

/** Card-ready summaries for an explicit set of ids, which is how a deep link finds its one boat. */
export const listingSummariesQueryOptions = (listingIds: string[]) =>
  orpc.listings.byIds.queryOptions({ input: { listingIds }, enabled: listingIds.length > 0 });

/** Matches the `hours` tier the server caches this on, so hydration does not immediately refetch. */
const ONE_HOUR = 60 * 60 * 1000;

/* `locale` is part of the input, so it is part of the key — server prefetch and client hook must
 * pass the same one or the hydrated cache misses and the page refetches in English. */
export const listingDetailQueryOptions = (id: string, locale: string) =>
  orpc.listings.get.queryOptions({ input: { id, locale }, staleTime: ONE_HOUR });

/**
 * Counts this visitor against the listing for today. Fire-and-forget: the detail page
 * does not read the result, and a failed count must never surface to the visitor.
 */
export const recordListingViewMutationOptions = () => orpc.listings.recordView.mutationOptions();
