import { describe, expect, it } from "vitest";

import { arrivalOf, routeCaption, routeCurve, routePoints, type RouteStop } from "./route-points";

const stop = (day: number, lat: number, lng: number): RouteStop => ({
  day,
  title: `Day ${day}`,
  description: null,
  lat,
  lng,
});

const SPLIT = { lat: 43.5, lng: 16.44 };
const HVAR = { lat: 43.17, lng: 16.44 };
const VIS = { lat: 43.06, lng: 16.18 };

/* A round trip: out from Split, two islands, back to Split. */
const ROUND_TRIP = [
  stop(1, SPLIT.lat, SPLIT.lng),
  stop(2, HVAR.lat, HVAR.lng),
  stop(3, VIS.lat, VIS.lng),
  stop(4, SPLIT.lat, SPLIT.lng),
];

const WORDS = { start: "Start", finish: "Finish", day: (day: number) => `Day ${day}` };

describe("routePoints", () => {
  it("groups stops sharing a coordinate and keeps their days in order", () => {
    const points = routePoints(ROUND_TRIP);

    expect(points).toHaveLength(3);
    expect(points[0]).toMatchObject({ ...SPLIT, days: [1, 4] });
    expect(points[0].stops).toHaveLength(2);
  });

  it("does not merge near-matches", () => {
    expect(routePoints([stop(1, 43.5, 16.44), stop(2, 43.500_01, 16.44)])).toHaveLength(2);
  });

  it("is empty for no stops", () => {
    expect(routePoints([])).toEqual([]);
  });
});

describe("routeCaption", () => {
  it("names a base that is both ends, and numbers the middle", () => {
    const [base, hvar] = routePoints(ROUND_TRIP);

    expect(routeCaption(base, ROUND_TRIP, WORDS)).toBe("Start · Finish");
    expect(routeCaption(hvar, ROUND_TRIP, WORDS)).toBe("Day 2");
  });

  it("names separate start and finish on a one-way route", () => {
    const oneWay = [
      stop(1, SPLIT.lat, SPLIT.lng),
      stop(2, HVAR.lat, HVAR.lng),
      stop(3, VIS.lat, VIS.lng),
    ];
    const [first, , last] = routePoints(oneWay);

    expect(routeCaption(first, oneWay, WORDS)).toBe("Start");
    expect(routeCaption(last, oneWay, WORDS)).toBe("Finish");
  });
});

describe("routeCurve", () => {
  it("passes through every stop and ends on the last", () => {
    const curve = routeCurve(ROUND_TRIP);

    expect(curve.points[0]).toEqual(SPLIT);
    expect(curve.points.at(-1)).toEqual(SPLIT);
    expect(curve.points).toContainEqual(HVAR);
    expect(curve.points).toContainEqual(VIS);
  });

  it("orders by day whatever order the stops arrive in", () => {
    const shuffled = [ROUND_TRIP[2], ROUND_TRIP[0], ROUND_TRIP[3], ROUND_TRIP[1]];

    expect(routeCurve(shuffled).points).toEqual(routeCurve(ROUND_TRIP).points);
  });

  it("records arrivals from 0 to 1, first arrival winning", () => {
    const curve = routeCurve(ROUND_TRIP);

    expect(arrivalOf(curve, SPLIT)).toBe(0);
    const hvar = arrivalOf(curve, HVAR);
    const vis = arrivalOf(curve, VIS);
    expect(hvar).toBeGreaterThan(0);
    expect(vis).toBeGreaterThan(hvar);
    expect(vis).toBeLessThan(1);
  });

  it("returns the lone stop without arrivals", () => {
    const curve = routeCurve([stop(1, SPLIT.lat, SPLIT.lng)]);

    expect(curve.points).toEqual([SPLIT]);
    expect(curve.arrivals.size).toBe(0);
    expect(arrivalOf(curve, SPLIT)).toBe(0);
  });
});
