/*
 * How close two bases must be to share a pin. Two vendors describe one harbour with their own
 * coordinates and their own spelling: Booking Manager's "Šolta / Rogač" and NauSYS's "Rogač (Šolta)"
 * sit 70 m apart, far enough for the map to draw two identical pins side by side at every zoom it
 * allows. A different marina is rarely this close, and where one is, a single card listing both is
 * still an honest answer to a tap on that quay.
 */
export const SAME_HARBOUR_METRES = 300;

const EARTH_RADIUS_METRES = 6_371_000;
const METRES_PER_DEGREE_LAT = 111_195;

type Place = { lat: number; lng: number; count: number };

function metresBetween(a: Place, b: Place): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(h));
}

/**
 * Moves every base onto the busiest base within `metres` of it, so the map clusters them as one
 * spot. No zoom separates points that share a coordinate, which sends a tap down the path already
 * built for that case: one card over all of them, with their boats counted together.
 *
 * Each base joins the busiest one near it rather than any neighbour, so a quay does not chain into
 * the next harbour one short hop at a time. Order and every other field are kept.
 */
export function snapToSameHarbour<T extends Place>(
  marinas: T[],
  metres = SAME_HARBOUR_METRES,
): T[] {
  const anchors: Place[] = [];
  const anchorOf = new Map<T, Place>();
  const latWindow = metres / METRES_PER_DEGREE_LAT;

  for (const marina of marinas.toSorted((a, b) => b.count - a.count)) {
    const anchor = anchors.find(
      (candidate) =>
        Math.abs(candidate.lat - marina.lat) <= latWindow &&
        metresBetween(candidate, marina) <= metres,
    );
    if (anchor) anchorOf.set(marina, anchor);
    else anchors.push(marina);
  }

  return marinas.map((marina) => {
    const anchor = anchorOf.get(marina);
    return anchor ? { ...marina, lat: anchor.lat, lng: anchor.lng } : marina;
  });
}
