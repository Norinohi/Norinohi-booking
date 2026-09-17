import { sql, type SQL } from "drizzle-orm";

/* The IUGG mean radius. The haversine treats the Earth as a sphere, so which radius is picked
   matters less than using the same one in TypeScript and in SQL. */
export const EARTH_RADIUS_KM = 6371.0088;

export type GeoPoint = { lat: number; lng: number };

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two points in kilometres, by the haversine formula. */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  /* Floating point can push `h` a hair past 1 for antipodal points, where asin would be NaN. */
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}

/* A bare parameter inside `radians()` leaves Postgres guessing its type, so numbers go in cast. */
export function doubleSql(value: number): SQL {
  return sql`${value}::double precision`;
}

/**
 * The same haversine as `distanceKm`, as a SQL expression over columns, or numbers passed through
 * `doubleSql`.
 *
 * Plain math functions rather than PostGIS or earthdistance: neither extension is installed, and
 * adding one is a migration of its own.
 */
export function distanceKmSql(latA: SQL, lngA: SQL, latB: SQL, lngB: SQL): SQL {
  return sql`(2 * ${doubleSql(EARTH_RADIUS_KM)} * asin(least(1::double precision, sqrt(
    power(sin(radians(${latB} - ${latA}) / 2), 2)
    + cos(radians(${latA})) * cos(radians(${latB})) * power(sin(radians(${lngB} - ${lngA}) / 2), 2)
  ))))`;
}
