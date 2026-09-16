import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import {
  routeListQueryOptions,
  faqListQueryOptions,
  popularFacetsQueryOptions,
  popularYachtsConfigQueryOptions,
} from "./queries";

/** Server prefetch for /routes — the first page of the whole route library, drafts included. */
export function prefetchRoutes(queryClient: QueryClient) {
  return queryClient.prefetchQuery(routeListQueryOptions({ page: 1 }));
}

/** Server prefetch for /faq — the site-wide list, every category, which is how the screen opens. */
export function prefetchFaq(queryClient: QueryClient) {
  return queryClient.prefetchQuery(faqListQueryOptions({ scope: "site", page: 1 }));
}

/**
 * Server prefetch for /popular — countries pinned into the pickers, which is how it opens.
 *
 * The screen's two selects change both halves of the key, so only this one pairing is warm;
 * switching kind or surface fetches. That is the honest trade — prefetching all sixteen
 * combinations to save one request on fifteen of them nobody opened.
 */
export function prefetchPopularFacets(queryClient: QueryClient) {
  return queryClient.prefetchQuery(
    popularFacetsQueryOptions({ kind: "country", surface: "popular" }),
  );
}

export function prefetchPopularYachtsConfig(queryClient: QueryClient) {
  return queryClient.prefetchQuery(popularYachtsConfigQueryOptions());
}
