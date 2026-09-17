import { sql, type SQL } from "drizzle-orm";

import { doubleSql, EARTH_RADIUS_KM, type GeoPoint } from "./distance";

export type BoundingBox = {
  minLat: number;
  maxLat: number;
  /*
   * When `minLng > maxLng` the box crosses the antimeridian, and a longitude is inside it when
   * it is at or above `minLng` or at or below `maxLng`.
   */
  minLng: number;
  maxLng: number;
};

const KM_PER_DEGREE_LAT = (Math.PI * EARTH_RADIUS_KM) / 180;

/**
 * The smallest latitude/longitude box that contains every point within `radiusKm` of `center`.
 *
 * It over-covers on purpose: it exists to let a plain comparison on `lat`/`lng` throw away most
 * rows before the exact distance is computed, so it may keep a point outside the circle but must
 * never drop one inside it. Near a pole a degree of longitude shrinks towards nothing, so once
 * the circle reaches the pole every longitude is admitted.
 */
export function boundingBox(center: GeoPoint, radiusKm: number): BoundingBox {
  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const minLat = Math.max(-90, center.lat - latDelta);
  const maxLat = Math.min(90, center.lat + latDelta);

  if (minLat <= -90 || maxLat >= 90) {
    return { minLat, maxLat, minLng: -180, maxLng: 180 };
  }

  /* The widest parallel inside the box is the one nearest a pole, so the longitude span is
     measured there rather than at the centre. */
  const widestLat = Math.max(Math.abs(minLat), Math.abs(maxLat));
  const lngDelta = latDelta / Math.cos((widestLat * Math.PI) / 180);
  if (lngDelta >= 180) return { minLat, maxLat, minLng: -180, maxLng: 180 };

  return {
    minLat,
    maxLat,
    minLng: wrapLongitude(center.lng - lngDelta),
    maxLng: wrapLongitude(center.lng + lngDelta),
  };
}

function wrapLongitude(lng: number): number {
  if (lng < -180) return lng + 360;
  if (lng > 180) return lng - 360;
  return lng;
}

export function isInBoundingBox(point: GeoPoint, box: BoundingBox): boolean {
  if (point.lat < box.minLat || point.lat > box.maxLat) return false;
  return box.minLng <= box.maxLng
    ? point.lng >= box.minLng && point.lng <= box.maxLng
    : point.lng >= box.minLng || point.lng <= box.maxLng;
}

/** `isInBoundingBox` as a predicate over two columns, in a form a btree on either can serve. */
export function boundingBoxSql(latColumn: SQL, lngColumn: SQL, box: BoundingBox): SQL {
  const lng =
    box.minLng <= box.maxLng
      ? sql`${lngColumn} between ${doubleSql(box.minLng)} and ${doubleSql(box.maxLng)}`
      : sql`(${lngColumn} >= ${doubleSql(box.minLng)} or ${lngColumn} <= ${doubleSql(box.maxLng)})`;
  return sql`(${latColumn} between ${doubleSql(box.minLat)} and ${doubleSql(box.maxLat)} and ${lng})`;
}
