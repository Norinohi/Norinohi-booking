import { distanceKm } from "@yacht-charter/db/geo/distance";
import { type BaseNearRoute, listBasesNearRoute } from "@yacht-charter/db/geo/nearest-marinas";
import { findRoutePlaces } from "@yacht-charter/db/routes/popular-routes";
import { valueForLabel } from "@yacht-charter/db/search/filters";

import type { Context } from "../context";
import { NotFoundError } from "../errors";

/*
 * Within this of any stop counts as "in the route's area": a short hop along the coast, so a boat
 * picked up there can still join the itinerary, without reaching the next bay's hub.
 */
export const ROUTE_MARINA_RADIUS_KM = 20;
export const ROUTE_MARINA_LIMIT = 24;
/* Enough to show the choice at a stop; without it the start's hub fills the whole list. */
export const ROUTE_MARINAS_PER_STOP = 4;
/* Bases this close are one harbour filed by several vendors under several names. */
export const SAME_MARINA_KM = 1;
/* Every base in the area comes back before grouping; a busy hub alone is a few dozen. */
const BASE_POOL = 400;

export type RouteMarina = {
  name: string;
  /** One key per marina, the value of the name it is shown under. */
  value: string;
  /** Every name its bases are filed under, as catalogue filter values, so a link finds them all. */
  values: string[];
  lat: number;
  lng: number;
  distanceKm: number;
  /** The stop this marina is closest to, named as the itinerary names it. */
  nearStop: string;
  listingCount: number;
};

type Group = { members: BaseNearRoute[]; stopIndex: number };

const biggest = (members: BaseNearRoute[]) =>
  members.reduce((best, member) => (member.listingCount > best.listingCount ? member : best));

/**
 * Bases grouped into marinas, capped per stop and overall, in the order the route passes them.
 *
 * Vendors file one harbour as several bases: "Marina Kastela" and "Kaštel Gomilica / Marina
 * Kaštela", four names for the port of Split. Listed as they come, the start alone filled the list
 * with one place under different spellings and the islands never showed. So a base joins a marina
 * already found when it shares its name or lies within `SAME_MARINA_KM` of it, and the marina
 * takes the name and position of its biggest base, which is the one a sailor would know it by.
 *
 * `bases` arrive in route order, nearest first within a stop; a stop's marinas come back biggest
 * first, since which is worth sailing from matters more than which is a few hundred metres closer.
 */
export function groupRouteMarinas(
  bases: BaseNearRoute[],
  { perStop, limit }: { perStop: number; limit: number },
): RouteMarina[] {
  const groups: Group[] = [];

  for (const base of bases) {
    const value = valueForLabel(base.name);
    const home = groups.find((group) =>
      group.members.some(
        (member) =>
          valueForLabel(member.name) === value || distanceKm(member, base) <= SAME_MARINA_KM,
      ),
    );
    if (home) home.members.push(base);
    else groups.push({ members: [base], stopIndex: base.nearStopIndex });
  }

  /* Within a stop the biggest marinas first: a hub's four ports a kilometre apart matter less
     than the marina down the coast with two hundred boats. Stops stay in route order. */
  const ranked = groups.toSorted(
    (a, b) =>
      a.stopIndex - b.stopIndex ||
      b.members.reduce((sum, member) => sum + member.listingCount, 0) -
        a.members.reduce((sum, member) => sum + member.listingCount, 0),
  );

  const perStopCount = new Map<number, number>();
  const marinas: RouteMarina[] = [];
  for (const group of ranked) {
    const shown = perStopCount.get(group.stopIndex) ?? 0;
    if (shown >= perStop) continue;
    perStopCount.set(group.stopIndex, shown + 1);

    const lead = biggest(group.members);
    const first = group.members[0] ?? lead;
    marinas.push({
      name: lead.name,
      value: valueForLabel(lead.name),
      values: [...new Set(group.members.map((member) => valueForLabel(member.name)))],
      lat: lead.lat,
      lng: lead.lng,
      distanceKm: Math.min(...group.members.map((member) => member.distanceKm)),
      nearStop: first.nearStop,
      listingCount: group.members.reduce((sum, member) => sum + member.listingCount, 0),
    });
    if (marinas.length === limit) break;
  }
  return marinas;
}

/** The marinas with boats along a route, in the order the route passes them. */
export async function listRouteMarinas(db: Context["db"], routeId: string): Promise<RouteMarina[]> {
  const stops = await findRoutePlaces(db, routeId);
  if (!stops) throw new NotFoundError({ message: `Route ${routeId} is not published` });

  const bases = await listBasesNearRoute(db, {
    stops,
    maxKm: ROUTE_MARINA_RADIUS_KM,
    limit: BASE_POOL,
  });
  return groupRouteMarinas(bases, { perStop: ROUTE_MARINAS_PER_STOP, limit: ROUTE_MARINA_LIMIT });
}
