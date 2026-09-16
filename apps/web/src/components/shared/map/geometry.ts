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

/*
 * The middle of a set of places, per axis. A median rather than the box's centre, so a few boats in
 * the Caribbean and Thailand do not drag a Mediterranean fleet's middle into the Sahara.
 */
export function medianOf(points: Coordinates[]): Coordinates | undefined {
  if (points.length === 0) return undefined;
  const middle = (values: number[]) => {
    const sorted = values.toSorted((a, b) => a - b);
    const half = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? ((sorted[half - 1] ?? 0) + (sorted[half] ?? 0)) / 2
      : (sorted[half] ?? 0);
  };
  return {
    lat: middle(points.map((point) => point.lat)),
    lng: middle(points.map((point) => point.lng)),
  };
}

/** GeoJSON orders a position longitude first, the reverse of how the app spells a place. */
export function toPosition(point: Coordinates): [number, number] {
  return [point.lng, point.lat];
}
