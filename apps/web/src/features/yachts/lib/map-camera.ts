import type { MapInstance } from "@/components/shared/data-display/map-canvas";
import type { Coordinates } from "@/components/shared/overlay/marina-popover";

/**
 * The tightest box holding every point, in the `[[west, south], [east, north]]` pairs mapbox's
 * `fitBounds` and `cameraForBounds` take.
 *
 * Shared by the itinerary map, which frames a route, and the search map, which frames the boats
 * inside a cluster it is about to break apart.
 */
export function boundsOf(points: Coordinates[]): [[number, number], [number, number]] {
  const lngs = points.map((point) => point.lng);
  const lats = points.map((point) => point.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

export type Padding = { top: number; right: number; bottom: number; left: number };

/**
 * How much of the map's edges the panels over it have claimed.
 *
 * `getPadding` always answers with all four sides, but types them as optional, and both callers
 * do arithmetic on the numbers — so the filling in happens once, here, rather than at every use.
 */
export function paddingOf(map: MapInstance): Padding {
  const { top = 0, right = 0, bottom = 0, left = 0 } = map.getPadding();
  return { top, right, bottom, left };
}
