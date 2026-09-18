import { buildSearchHref, type SearchCriteria } from "@/features/yachts";

import type { RouteMarina } from "../api/queries";

type RouteTarget = {
  nights: number;
  countryValue: string | null;
  sailingAreaValue: string | null;
  marinaValue: string | null;
};

/**
 * The catalogue filtered to the boats that could sail a route: its country, sailing area or
 * starting marina, and its length. Every link to it from the routes map opens in a new tab, so
 * the route the visitor was reading is still there when they come back.
 *
 * With a marina from the map, that marina replaces the route's own place, since the visitor has
 * just picked where to start, and every name its bases are filed under goes along: one harbour is
 * often several vendors' bases, and filtering by one name would drop the others' boats.
 */
export function routeCatalogueHref(route: RouteTarget, marina?: Pick<RouteMarina, "values">) {
  const criteria: SearchCriteria = { duration: String(route.nights) };
  if (route.countryValue) criteria.country = [route.countryValue];
  if (marina) {
    criteria.marina = marina.values;
  } else {
    if (route.sailingAreaValue) criteria.sailingArea = [route.sailingAreaValue];
    if (route.marinaValue) criteria.marina = [route.marinaValue];
  }
  return buildSearchHref(criteria);
}
