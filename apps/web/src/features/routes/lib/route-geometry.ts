import type { Coordinates } from "@/components/shared/map/geometry";
import type { RouteStop } from "@/components/shared/map/route-points";

import type { MapRoute } from "../api/queries";

/** The itinerary in the shape the listing page's route drawing takes, one day per stop. */
export function toRouteStops(route: MapRoute): RouteStop[] {
  return route.stops.map((stop, index) => ({
    day: index + 1,
    title: stop.name,
    description: stop.note,
    lat: stop.lat,
    lng: stop.lng,
  }));
}

/** Where a route is pinned while every route is on the map: where the charter starts. */
export function routeStart(route: MapRoute): Coordinates | null {
  const [first] = route.stops;
  return first ? { lat: first.lat, lng: first.lng } : null;
}
