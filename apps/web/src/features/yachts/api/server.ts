import "server-only";

import { ORPCError } from "@orpc/client";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import { cacheLife } from "next/cache";

import { facetsQueryOptions } from "@/components/shared/form/filters/api/queries";
import { getFacets } from "@/components/shared/form/filters/api/server";
import { getRootLocale } from "@/i18n/root-locale";
import { publicClient } from "@/utils/orpc";

import { listingDetailQueryOptions } from "./queries";

/**
 * Server prefetch for the /yachts search route.
 *
 * Only the facets are seeded. The result set depends on the URL (filters, sort, page), so it is
 * genuinely per-request and is fetched client-side behind a boundary — there is no shell to put
 * it in. The facets, by contrast, drive the filter controls on every variant of this route, so
 * caching them lets the search chrome prerender.
 *
 * The dehydrated blob is cached rather than rebuilt per request because `dehydrate()` stamps
 * `dataUpdatedAt` from `Date.now()`, and that clock read alone would block prerendering. The
 * client `staleTime` on `facetsQueryOptions` matches this tier so hydration does not refetch.
 *
 * The locale reaches the cache key through the root param (see `getRootLocale`), but is still read
 * by name here: the seeded query key has to match the one the client hook rebuilds from its own
 * locale, or hydration fills an entry nothing reads and the browser refetches on mount.
 */
export async function prefetchSearch() {
  "use cache";
  cacheLife("days");

  const queryClient = new QueryClient();
  const [locale, facets] = await Promise.all([getRootLocale(), getFacets()]);
  queryClient.setQueryData(facetsQueryOptions(locale).queryKey, facets);

  return dehydrate(queryClient);
}

/**
 * Server prefetch for one listing.
 *
 * Cached per id on the `hours` tier — catalog data, so a slightly stale description or rating is
 * harmless (docs/adr/0002). Availability and pricing are deliberately absent; those are
 * booking-critical and must never be served from a cache.
 *
 * The read goes through `publicClient` because `"use cache"` forbids reading request headers, and
 * `listingDetailQueryOptions` is bound to the header-forwarding client. Query keys derive from the
 * procedure path and input alone, so seeding that key by hand still matches the client hook.
 *
 * **Not keyed by locale, and correct only while listings are not localized.** Facet copy is the
 * only translated part of the catalog today (`facet_media_translation`); a listing's own text comes
 * from `listing_search_doc`, which the read model builds with a hardcoded `locale = 'en'`. The day
 * that changes, this entry starts serving one language's description to all three — add the locale
 * to the signature at the same time, not after.
 *
 * **A miss is thrown, never returned.** Returning `{ found: false }` from here would cache the
 * absence for the full hour, so a listing created after someone happened to visit its URL would
 * keep 404ing long after it existed. Next caches resolved values but not rejections, so throwing
 * is what keeps a miss uncached and re-checked on the next request. The error is deliberately a
 * plain `Error` subclass carrying a marker field rather than a class check: errors are serialized
 * on the way out of a cached function, so `instanceof` cannot be trusted on the far side.
 */
export const LISTING_NOT_FOUND = "LISTING_NOT_FOUND";

export function isListingNotFound(error: unknown): boolean {
  return error instanceof Error && error.message === LISTING_NOT_FOUND;
}

export async function prefetchListingDetail(id: string) {
  "use cache";
  cacheLife("hours");

  let listing: Awaited<ReturnType<typeof publicClient.listings.get>>;
  try {
    listing = await publicClient.listings.get({ id });
  } catch (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") {
      throw new Error(LISTING_NOT_FOUND);
    }
    throw error;
  }

  const queryClient = new QueryClient();
  queryClient.setQueryData(listingDetailQueryOptions(id).queryKey, listing);

  /*
   * `seo` rides along so `generateMetadata` can build the head off this same cached read instead
   * of fetching the listing a second time. `slug` in particular is what keeps the canonical
   * stable: `listings.get` accepts an id *or* a slug, so the same boat is reachable at two URLs
   * and the head has to name one of them.
   */
  return {
    state: dehydrate(queryClient),
    title: listing.title,
    seo: {
      slug: listing.slug,
      description: listing.description,
      image: listing.mainImage,
      builder: listing.builder,
      model: listing.model,
      category: listing.category,
    },
  };
}
