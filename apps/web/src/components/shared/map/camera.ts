import { boundsOf, type Coordinates, medianOf } from "./geometry";
import type { MapInstance } from "./map-canvas";

export type Padding = { top: number; right: number; bottom: number; left: number };

/**
 * How much of the map's edges the panels over it have claimed.
 *
 * `getPadding` always answers with all four sides, but types them as optional, and both callers
 * do arithmetic on the numbers - so the filling in happens once, here, rather than at every use.
 */
export function paddingOf(map: MapInstance): Padding {
  const { top = 0, right = 0, bottom = 0, left = 0 } = map.getPadding();
  return { top, right, bottom, left };
}

export function samePadding(a: Padding, b: Padding): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

/**
 * Frames every place on the map, inside whatever padding the panels over it have claimed.
 *
 * A set spread over the whole world needs a zoom below the map's minimum. Mapbox then clamps the
 * zoom and puts the centre near a pole, so that case opens on the middle of the set at the widest
 * zoom instead. Shared by the search's first fit and by the button that frames it again.
 */
export function fitPlaces(
  map: MapInstance,
  places: Coordinates[],
  options: { maxZoom: number; duration?: number },
) {
  if (places.length === 0) return;
  const camera = { padding: paddingOf(map), maxZoom: options.maxZoom };
  const duration = options.duration ?? 0;
  const fitted = map.cameraForBounds(boundsOf(places), camera);

  if (!fitted?.zoom || fitted.zoom < map.getMinZoom()) {
    const middle = medianOf(places);
    if (middle) map.easeTo({ center: [middle.lng, middle.lat], zoom: map.getMinZoom(), duration });
    return;
  }
  map.fitBounds(boundsOf(places), { ...camera, duration });
}
