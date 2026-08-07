import "server-only";

import { dehydrate, QueryClient } from "@tanstack/react-query";
import { cacheLife } from "next/cache";

import { facetsQueryOptions } from "@/components/shared/form/filters/api/queries";
import { publicClient } from "@/utils/orpc";

import { POPULAR_YACHTS_INPUT, popularYachtsQueryOptions } from "./queries";

/*
 * The two catalog reads behind the home page, each on its own tier (docs/adr/0002). Keeping them
 * as separate cached functions means the facet taxonomy is not re-fetched from the API just
 * because the listing cards rolled over.
 */

/** Filter taxonomy — countries, boat types, budget bands. Changes when inventory changes. */
async function getFacets() {
  "use cache";
  cacheLife("days");

  return publicClient.charterSearch.facets({});
}

/** The five highest-rated listings. Catalog data: a slightly stale rating harms nobody. */
async function getPopularYachts() {
  "use cache";
  cacheLife("hours");

  return publicClient.charterSearch.results(POPULAR_YACHTS_INPUT);
}

/**
 * Server prefetch for the home page — facets feed the destination/boat-type/budget sections.
 *
 * The whole dehydrated blob is cached, not just the payloads. `dehydrate()` stamps each entry
 * with `dataUpdatedAt` from `Date.now()`, and an unstable clock read is exactly what stops a route
 * from prerendering — dehydrating per request fails the build with
 * `blocking-prerender-current-time`. Caching the blob freezes those timestamps at cache-fill
 * time, which is why the client `staleTime` for each of these queries is pinned to its server
 * tier: without that, every visitor would hydrate with data the client believes is stale and
 * immediately refetch it, giving back the saving.
 *
 * Nothing here is wrapped in `<Suspense>` on purpose. These reads resolve from cache, so they can
 * live in the prerendered shell; deferring them would push content out of it for no gain.
 */
export async function prefetchHome() {
  "use cache";
  cacheLife("hours");

  const queryClient = new QueryClient();
  const [facets, popularYachts] = await Promise.all([getFacets(), getPopularYachts()]);

  queryClient.setQueryData(facetsQueryOptions().queryKey, facets);
  queryClient.setQueryData(popularYachtsQueryOptions().queryKey, popularYachts);

  return dehydrate(queryClient);
}
