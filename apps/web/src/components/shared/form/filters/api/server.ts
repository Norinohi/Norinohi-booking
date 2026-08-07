import "server-only";

import { cacheLife } from "next/cache";

import { publicClient } from "@/utils/orpc";

/**
 * The filter taxonomy — countries, boat types, budget bands, ranges.
 *
 * Catalog data on the `days` tier (docs/adr/0002): it changes when inventory changes, not per
 * request, and every route that renders a filter control needs it. Reading it through
 * `"use cache"` is what lets those routes prerender — a cached read is a cache boundary, not a
 * blocking one — and going through `publicClient` keeps request headers out of the call, which
 * `"use cache"` forbids.
 *
 * Lives here rather than in a feature so home and search share one cache entry instead of each
 * filling their own.
 */
export async function getFacets() {
  "use cache";
  cacheLife("days");

  return publicClient.charterSearch.facets({});
}
