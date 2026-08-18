import "server-only";

import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import { ORPCError } from "@orpc/client";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import { cacheLife, cacheTag } from "next/cache";

import { facetsQueryOptions } from "@/components/shared/form/filters/api/queries";
import { getFacets } from "@/components/shared/form/filters/api/server";
import { CATALOG_TAG, listingTag } from "@/lib/cache-tags";
import { getRootLocale } from "@/i18n/root-locale";
import { publicClient } from "@/utils/orpc";

import { listingDetailQueryOptions } from "./queries";

type CatalogPage = Awaited<ReturnType<AppRouterClient["charterSearch"]["catalogPages"]>>[number];

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
  cacheTag(CATALOG_TAG);

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
 * Keyed by locale as well as id: `listings.get` now localizes its labels and returns the provider's
 * prose for that locale, so one entry per id would serve one language's copy to all three.
 *
 * **A miss is thrown, never returned.** Returning `{ found: false }` from here would cache the
 * absence for the full hour, so a listing created after someone happened to visit its URL would
 * keep 404ing long after it existed. Next caches resolved values but not rejections, so throwing
 * is what keeps a miss uncached and re-checked on the next request. The error is deliberately a
 * plain `Error` subclass carrying a marker field rather than a class check: errors are serialized
 * on the way out of a cached function, so `instanceof` cannot be trusted on the far side.
 */
export const LISTING_NOT_FOUND = "LISTING_NOT_FOUND";

export function isListingNotFound(error: Error): boolean {
  return error.message === LISTING_NOT_FOUND;
}

export async function prefetchListingDetail(id: string, locale: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG, listingTag(id));

  let listing: Awaited<ReturnType<typeof publicClient.listings.get>>;
  try {
    listing = await publicClient.listings.get({ id, locale });
  } catch (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") {
      throw new Error(LISTING_NOT_FOUND);
    }
    throw error;
  }

  const queryClient = new QueryClient();
  queryClient.setQueryData(listingDetailQueryOptions(id, locale).queryKey, listing);

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
      crewType: listing.crewType,
      cabins: listing.specs.cabins,
      berths: listing.specs.berths,
      base: listing.base.name,
      country: listing.base.country,
      priceFromMinor: listing.priceFrom?.amountMinor ?? null,
    },
  };
}

/**
 * Every generated catalog page, as the enumeration returns them.
 *
 * The one source `generateStaticParams`, the sitemap and each page's own segment lookup read, so
 * a URL is never advertised that the router will not build. Cached on the catalog tag: the set
 * only moves when a sync moves the counts behind it.
 *
 * Keyed by locale, because the headings it carries are translated. The segments are not, so every
 * locale returns the same set of URLs.
 */
export async function prefetchCatalogPages(locale: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  return publicClient.charterSearch.catalogPages({ locale });
}

/** The page's own boats, rendered into the HTML rather than fetched by the browser. */
export async function prefetchCatalogResults(
  filters: CatalogPage["filters"],
  locale: string,
  pageSize: number,
) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  return publicClient.charterSearch.results({
    locale,
    pageSize,
    page: 1,
    sort: "recommended",
    /* Arrays because the filters are multi-select; a catalog page pins exactly one of each. */
    country: filters.country ? [filters.country] : undefined,
    sailingArea: filters.region ? [filters.region] : undefined,
    city: filters.city ? [filters.city] : undefined,
    marina: filters.marina ? [filters.marina] : undefined,
    boatType: filters.category ? [filters.category] : undefined,
    model: filters.model ? [filters.model] : undefined,
  });
}
