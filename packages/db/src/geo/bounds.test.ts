import { describe, expect, it } from "vitest";

import { boundingBox, isInBoundingBox } from "./bounds";
import { distanceKm, EARTH_RADIUS_KM, type GeoPoint } from "./distance";

/* The point `km` away from `from` on the initial bearing `bearing`, on the same sphere. */
function destination(from: GeoPoint, bearingDegrees: number, km: number): GeoPoint {
  const rad = Math.PI / 180;
  const angular = km / EARTH_RADIUS_KM;
  const bearing = bearingDegrees * rad;
  const lat1 = from.lat * rad;
  const lng1 = from.lng * rad;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: lat2 / rad, lng: ((((lng2 / rad + 540) % 360) + 360) % 360) - 180 };
}

function circleAround(center: GeoPoint, km: number): GeoPoint[] {
  return Array.from({ length: 72 }, (_, index) => destination(center, index * 5, km * 0.999));
}

describe("boundingBox", () => {
  it("contains every point on the circle it was built for", () => {
    const split = { lat: 43.5081, lng: 16.4402 };
    const box = boundingBox(split, 50);
    for (const point of circleAround(split, 50)) {
      expect(distanceKm(split, point)).toBeLessThan(50);
      expect(isInBoundingBox(point, box)).toBe(true);
    }
  });

  it("contains the circle at high latitude, where longitude degrees are short", () => {
    const tromso = { lat: 69.6496, lng: 18.956 };
    const box = boundingBox(tromso, 300);
    for (const point of circleAround(tromso, 300)) {
      expect(isInBoundingBox(point, box)).toBe(true);
    }
  });

  it("rejects a point just beyond the radius due north", () => {
    const split = { lat: 43.5081, lng: 16.4402 };
    const box = boundingBox(split, 50);
    expect(isInBoundingBox(destination(split, 0, 51), box)).toBe(false);
  });

  it("wraps across the antimeridian", () => {
    const fiji = { lat: -17.7134, lng: 179.9 };
    const box = boundingBox(fiji, 100);
    expect(box.minLng).toBeGreaterThan(box.maxLng);
    expect(isInBoundingBox({ lat: -17.7, lng: -179.8 }, box)).toBe(true);
    expect(isInBoundingBox({ lat: -17.7, lng: 0 }, box)).toBe(false);
    for (const point of circleAround(fiji, 100)) {
      expect(isInBoundingBox(point, box)).toBe(true);
    }
  });

  it("admits every longitude once the circle reaches a pole", () => {
    const box = boundingBox({ lat: 89.5, lng: 0 }, 100);
    expect(box).toMatchObject({ maxLat: 90, minLng: -180, maxLng: 180 });
  });
});
