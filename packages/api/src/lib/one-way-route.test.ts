import { describe, expect, it } from "vitest";

import { oneWayRouteOf, oneWayRouteText } from "./one-way-route";

const total = { amountMinor: 700_000, currency: "EUR" };

describe("oneWayRouteOf", () => {
  it("reads the one-way route the quote was priced on", () => {
    const route = oneWayRouteOf({
      route: { startBaseId: "31404981", endBaseId: "2206479" },
      routeOptions: [
        {
          startBaseId: "31404981",
          endBaseId: "2206479",
          startBaseName: "Fethiye, Yacht Club Mai",
          endBaseName: "Marmaris, Albatros Marina",
          isOneWay: true,
          total,
        },
      ],
    });

    expect(route).toEqual({ from: "Fethiye, Yacht Club Mai", to: "Marmaris, Albatros Marina" });
    expect(route && oneWayRouteText(route)).toBe(
      "Fethiye, Yacht Club Mai → Marmaris, Albatros Marina (one-way)",
    );
  });

  it("is null for a round trip and for a quote with no route", () => {
    expect(
      oneWayRouteOf({
        route: { startBaseId: "57", endBaseId: "57" },
        routeOptions: [{ startBaseId: "57", endBaseId: "57", isOneWay: false, total }],
      }),
    ).toBeNull();
    expect(oneWayRouteOf({ route: null, routeOptions: [] })).toBeNull();
  });

  it("still says one-way where the marinas have no names", () => {
    expect(oneWayRouteText({ from: null, to: null })).toBe("One-way");
  });
});
