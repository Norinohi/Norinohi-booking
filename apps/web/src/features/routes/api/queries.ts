import type { AppRouterClient } from "@yacht-charter/api/routers/index";

import type { Locale } from "@/i18n/config";
import { orpc } from "@/utils/orpc";

export type MapRoute = Awaited<
  ReturnType<AppRouterClient["charterSearch"]["routesMap"]>
>["routes"][number];

export type RouteMarina = Awaited<
  ReturnType<AppRouterClient["charterSearch"]["routeMarinas"]>
>["marinas"][number];

/** Matches the `hours` tier the server caches this on, so hydration does not refetch. */
const ONE_HOUR = 60 * 60 * 1000;

export const routesMapInput = (locale: Locale) => ({ locale }) as const;

export const routesMapQueryOptions = (locale: Locale) =>
  orpc.charterSearch.routesMap.queryOptions({
    input: routesMapInput(locale),
    staleTime: ONE_HOUR,
  });

/* Counts move with every sync, so these are not held as long as the routes themselves. */
const FIVE_MINUTES = 5 * 60 * 1000;

export const routeMarinasQueryOptions = (routeId: string) =>
  orpc.charterSearch.routeMarinas.queryOptions({
    input: { routeId },
    staleTime: FIVE_MINUTES,
  });
