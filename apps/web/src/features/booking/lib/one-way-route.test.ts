import { describe, expect, it } from "vitest";

import { oneWayRouteOf } from "./one-way-route";

const total = { amountMinor: 700_000, currency: "EUR" };

describe("oneWayRouteOf", () => {
  it("names both marinas of the route the quote was priced on", () => {
    expect(
      oneWayRouteOf({
        route: { startBaseId: "57", endBaseId: "61" },
        routeOptions: [
          {
            startBaseId: "57",
            endBaseId: "61",
            startBaseName: "ACI Marina Split",
            endBaseName: "Marina Kaštela",
            isOneWay: true,
            total,
          },
        ],
      }),
    ).toEqual({ from: "ACI Marina Split", to: "Marina Kaštela" });
  });

  it("says nothing about a round trip, or a quote with no route", () => {
    expect(
      oneWayRouteOf({
        route: { startBaseId: "57", endBaseId: "57" },
        routeOptions: [{ startBaseId: "57", endBaseId: "57", isOneWay: false, total }],
      }),
    ).toBeNull();
    expect(oneWayRouteOf({ route: null, routeOptions: [] })).toBeNull();
  });

  it("still flags a one-way whose marinas it cannot name", () => {
    expect(
      oneWayRouteOf({
        route: { startBaseId: "57", endBaseId: "61" },
        routeOptions: [{ startBaseId: "57", endBaseId: "61", isOneWay: true, total }],
      }),
    ).toEqual({ from: null, to: null });
  });
});
