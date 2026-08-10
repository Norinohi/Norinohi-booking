import "server-only";

import { cacheLife } from "next/cache";

import { getRootLocale } from "@/i18n/root-locale";
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
 * Lives here rather than in a feature so home and search share one cache entry per locale instead
 * of each filling their own.
 *
 * The locale comes from the root param rather than an argument. It still has to reach the cache
 * key — otherwise whichever language filled the entry would be served to everyone for a full day —
 * but `[locale]` is a root segment, so Next keys the prerendered variant by it without the callers
 * threading it down. Facet labels are the localized half of the response
 * (`facet_media_translation` server-side); `value` stays untranslated because the filters compare
 * against it.
 */
export async function getFacets() {
  "use cache";
  cacheLife("days");

  return publicClient.charterSearch.facets({ locale: await getRootLocale() });
}
