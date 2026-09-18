import "server-only";

import { dehydrate, QueryClient } from "@tanstack/react-query";
import { cacheLife, cacheTag } from "next/cache";

import { defaultLocale } from "@/i18n/config";
import { getRootLocale } from "@/i18n/root-locale";
import { CATALOG_TAG } from "@/lib/cache-tags";
import { publicClient } from "@/utils/orpc";

import { routesMapInput, routesMapQueryOptions } from "./queries";

/** Every published route in one language. Editorial content, so the `hours` tier. */
async function getRoutes(locale: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  return publicClient.charterSearch.routesMap({ locale });
}

/**
 * Every published route, dehydrated whole for the same reason `prefetchHome` is: `dehydrate()`
 * reads the clock, and caching the blob keeps that read out of the prerender.
 *
 * The marinas near a route are not prefetched: they are one small request after the map is up,
 * and the page is indexed for the route, not for today's boat counts.
 */
export async function prefetchRoutesMap() {
  "use cache";
  cacheLife("hours");
  cacheTag(CATALOG_TAG);

  const locale = await getRootLocale();
  const queryClient = new QueryClient();
  queryClient.setQueryData(
    routesMapQueryOptions(locale).queryKey,
    await publicClient.charterSearch.routesMap(routesMapInput(locale)),
  );
  return dehydrate(queryClient);
}

/** The published route at `/routes/<slug>` in `locale`, or null for a slug no route holds. */
export async function findRouteBySlug(slug: string, locale: string) {
  const { routes } = await getRoutes(locale);
  return routes.find((route) => route.slug === slug) ?? null;
}

/** `/routes` and one path per published route, for the sitemap. */
export async function routePaths(): Promise<string[]> {
  const { routes } = await getRoutes(defaultLocale);
  return ["/routes", ...routes.map((route) => `/routes/${route.slug}`)];
}
