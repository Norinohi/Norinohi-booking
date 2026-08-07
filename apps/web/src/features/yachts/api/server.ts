import "server-only";

import { dehydrate, QueryClient } from "@tanstack/react-query";
import { cacheLife } from "next/cache";

import { facetsQueryOptions } from "@/components/shared/form/filters/api/queries";
import { getFacets } from "@/components/shared/form/filters/api/server";
import { getQueryClient } from "@/utils/query-client";

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
 */
export async function prefetchSearch() {
  "use cache";
  cacheLife("days");

  const queryClient = new QueryClient();
  queryClient.setQueryData(facetsQueryOptions().queryKey, await getFacets());

  return dehydrate(queryClient);
}

export async function prefetchListingDetail(id: string) {
  const queryClient = getQueryClient();
  const listing = await queryClient.fetchQuery(listingDetailQueryOptions(id));
  return { state: dehydrate(queryClient), title: listing.title };
}
