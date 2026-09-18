import type { BaseNearRoute } from "@yacht-charter/db/geo/nearest-marinas";
import { describe, expect, it } from "vitest";

import { groupRouteMarinas } from "./route-marinas";

const base = (
  name: string,
  at: { lat: number; lng: number },
  listingCount: number,
  stop: [string, number] = ["Split", 0],
): BaseNearRoute => ({
  id: `${name}-${at.lat}`,
  name,
  location: name,
  city: null,
  region: "Dalmatia",
  country: "Croatia",
  countryCode: "HR",
  ...at,
  distanceKm: 0,
  listingCount,
  nearStop: stop[0],
  nearStopIndex: stop[1],
});

const SPLIT = { lat: 43.5026, lng: 16.43 };
const SPLIT_WEST = { lat: 43.5046, lng: 16.4304 };
const KASTELA = { lat: 43.5405, lng: 16.3475 };
const HVAR = { lat: 43.1636, lng: 16.3953 };

describe("groupRouteMarinas", () => {
  it("folds bases a few hundred metres apart into one marina named after its biggest", () => {
    const [split, ...rest] = groupRouteMarinas(
      [base("Port of Split / West Harbour", SPLIT_WEST, 44), base("ACI Marina Split", SPLIT, 404)],
      { perStop: 4, limit: 24 },
    );

    expect(rest).toEqual([]);
    expect(split).toMatchObject({ name: "ACI Marina Split", listingCount: 448, lat: SPLIT.lat });
    expect(split?.values.toSorted()).toEqual(["aci-marina-split", "port-of-split-west-harbour"]);
  });

  it("folds one name filed twice however far apart the vendors placed it", () => {
    const marinas = groupRouteMarinas(
      [base("Marina Kastela", KASTELA, 241), base("Marina Kastela", SPLIT, 3)],
      { perStop: 4, limit: 24 },
    );
    expect(marinas.map((marina) => [marina.name, marina.listingCount])).toEqual([
      ["Marina Kastela", 244],
    ]);
  });

  it("puts a stop's biggest marinas first and keeps the stops in route order", () => {
    const marinas = groupRouteMarinas(
      [
        base("Split", SPLIT, 30),
        base("Marina Kastela", KASTELA, 241),
        base("Palmizana", HVAR, 9, ["Hvar", 3]),
      ],
      { perStop: 4, limit: 24 },
    );
    expect(marinas.map((marina) => marina.name)).toEqual(["Marina Kastela", "Split", "Palmizana"]);
  });

  it("caps each stop so the start cannot crowd out the islands", () => {
    const start = [0, 1, 2, 3, 4].map((step) =>
      base(`Split ${step}`, { lat: 43.5 + step * 0.05, lng: 16.4 }, 1),
    );
    const marinas = groupRouteMarinas([...start, base("Palmizana", HVAR, 9, ["Hvar", 3])], {
      perStop: 4,
      limit: 24,
    });

    expect(marinas.map((marina) => marina.nearStop)).toEqual([
      "Split",
      "Split",
      "Split",
      "Split",
      "Hvar",
    ]);
  });
});
