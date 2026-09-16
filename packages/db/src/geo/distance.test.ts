import { describe, expect, it } from "vitest";

import { distanceKm, EARTH_RADIUS_KM } from "./distance";

describe("distanceKm", () => {
  it("is zero from a point to itself", () => {
    expect(distanceKm({ lat: 43.5081, lng: 16.4402 }, { lat: 43.5081, lng: 16.4402 })).toBe(0);
  });

  it("measures a degree of latitude along a meridian", () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.195, 2);
  });

  it("matches the published London to New York great-circle distance", () => {
    const london = { lat: 51.5007, lng: -0.1246 };
    const newYork = { lat: 40.6892, lng: -74.0445 };
    expect(distanceKm(london, newYork)).toBeCloseTo(5574.8, 0);
  });

  it("is symmetric", () => {
    const split = { lat: 43.5081, lng: 16.4402 };
    const dubrovnik = { lat: 42.6507, lng: 18.0944 };
    expect(distanceKm(split, dubrovnik)).toBe(distanceKm(dubrovnik, split));
  });

  it("stays finite for antipodal points", () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(
      Math.PI * EARTH_RADIUS_KM,
      6,
    );
  });

  it("takes the short way across the antimeridian", () => {
    expect(distanceKm({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 })).toBeCloseTo(111.195, 2);
  });
});
