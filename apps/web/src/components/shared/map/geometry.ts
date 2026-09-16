export type Coordinates = { lat: number; lng: number };

/** `[[west, south], [east, north]]`, the pairs mapbox's `fitBounds` and `cameraForBounds` take. */
export type LngLatBox = [[number, number], [number, number]];

/**
 * The tightest box holding every point.
 *
 * Shared by the itinerary map, which frames a route, and the search map, which frames the boats
 * inside a cluster it is about to break apart.
 */
export function boundsOf(points: Coordinates[]): LngLatBox {
  const lngs = points.map((point) => point.lng);
  const lats = points.map((point) => point.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/** GeoJSON orders a position longitude first, the reverse of how the app spells a place. */
export function toPosition(point: Coordinates): [number, number] {
  return [point.lng, point.lat];
}
