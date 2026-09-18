import type { NearestBase } from "@yacht-charter/db/geo/nearest-marinas";
import { listNearestBases } from "@yacht-charter/db/geo/nearest-marinas";
import { findRouteAnchor } from "@yacht-charter/db/routes/popular-routes";
import { valueForLabel } from "@yacht-charter/db/search/filters";

import type { Context } from "../context";
import { NotFoundError } from "../errors";

/* A day's sail from the start: close enough that a boat picked up there can still do the route. */
export const ROUTE_MARINA_RADIUS_KM = 50;
export const ROUTE_MARINA_LIMIT = 8;

export type RouteMarina = {
  name: string;
  value: string;
  lat: number;
  lng: number;
  distanceKm: number;
  listingCount: number;
};

/**
 * Bases folded into marinas by name, nearest first.
 *
 * Two vendors filing one marina come back from `listNearestBases` as two bases a few hundred
 * metres apart, and two pins with one name read as a fault. The catalogue filters by the name's
 * value anyway, so the merged pin links to both vendors' boats; it keeps the nearer position.
 */
export function mergeBasesByName(bases: NearestBase[], limit: number): RouteMarina[] {
  const byValue = new Map<string, RouteMarina>();

  for (const base of bases) {
    const value = valueForLabel(base.name);
    const seen = byValue.get(value);
    if (seen) {
      seen.listingCount += base.listingCount;
      continue;
    }
    byValue.set(value, {
      name: base.name,
      value,
      lat: base.lat,
      lng: base.lng,
      distanceKm: base.distanceKm,
      listingCount: base.listingCount,
    });
  }

  return [...byValue.values()].slice(0, limit);
}

/** The marinas with boats within a day's sail of where a route starts. */
export async function listRouteMarinas(db: Context["db"], routeId: string): Promise<RouteMarina[]> {
  const anchor = await findRouteAnchor(db, routeId);
  if (!anchor) throw new NotFoundError({ message: `Route ${routeId} is not published` });

  const bases = await listNearestBases(db, {
    ...anchor,
    /* Twice over, so merging duplicates still leaves a full list. */
    limit: ROUTE_MARINA_LIMIT * 2,
    maxKm: ROUTE_MARINA_RADIUS_KM,
    onlyWithListings: true,
  });
  return mergeBasesByName(bases, ROUTE_MARINA_LIMIT);
}
