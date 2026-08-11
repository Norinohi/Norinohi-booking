import "server-only";

import { dehydrate, QueryClient } from "@tanstack/react-query";
import { cacheLife, cacheTag } from "next/cache";

import { facetsQueryOptions } from "@/components/shared/form/filters/api/queries";
import { getFacets } from "@/components/shared/form/filters/api/server";
import { CATALOG_TAG } from "@/lib/cache-tags";
import { getRootLocale } from "@/i18n/root-locale";
import { publicClient } from "@/utils/orpc";

import { popularYachtsInput, popularYachtsQueryOptions } from "./queries";

/*
 * The two catalog reads behind the home page sit on different tiers (docs/adr/0002), so they stay
 * separate cached functions: the facet taxonomy is not re-fetched just because the listing cards
 * rolled over. `getFacets` is shared with the search route so both fill one cache entry.
 */

/** The five highest-rated listings. Catalog data: a slightly stale rating harms nobody. */
async function getPopularYachts() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  return publicClient.charterSearch.results(popularYachtsInput(await getRootLocale()));
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
 *
 * The locale is read here rather than taken as an argument (see `getRootLocale`), but it is still
 * needed by name: both payloads are seeded under query keys the browser rebuilds from its own
 * `useLocale()`, and the two sides have to agree or hydration fills keys nothing reads.
 *
 * Everything below this point is now keyed per locale, the popular yachts included: the server
 * translates a card's category, country and region, so the three variants hold different data and
 * each costs its own API call. That is the price of localized cards, not waste to squeeze out.
 */
export async function prefetchHome() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  const queryClient = new QueryClient();
  const [locale, facets, popularYachts] = await Promise.all([
    getRootLocale(),
    getFacets(),
    getPopularYachts(),
  ]);

  queryClient.setQueryData(facetsQueryOptions(locale).queryKey, facets);
  queryClient.setQueryData(popularYachtsQueryOptions(locale).queryKey, popularYachts);

  return dehydrate(queryClient);
}
