import { describe, expect, it } from "vitest";

import { placeKeys, regionFor } from "./geography";

const regions = [
  { countryCode: "HR", name: "Istra", points: [{ lat: 44.8666, lng: 13.8496 }] },
  { countryCode: "HR", name: "Kvarner", points: [{ lat: 45.0766, lng: 14.5431 }] },
  { countryCode: "HR", name: "Šibenik region", points: [{ lat: 43.7272, lng: 15.8826 }] },
  {
    countryCode: "GR",
    name: "Athens area/Saronic/Peloponese",
    points: [{ lat: 37.91, lng: 23.7 }],
  },
  { countryCode: "GR", name: "Dodecanese", points: [{ lat: 36.44, lng: 28.22 }] },
  { countryCode: "PT", name: "Azores", points: [{ lat: 37.74, lng: -25.66 }] },
];

describe("placeKeys", () => {
  it("folds accents and drops the words our region names add", () => {
    expect(placeKeys("Šibenik region")).toEqual(["sibenik"]);
    expect(placeKeys("Ionian Islands")).toEqual(["ionian"]);
  });

  it("splits a name that joins several places", () => {
    expect(placeKeys("Athens area/Saronic/Peloponese")).toEqual([
      "athens",
      "saronic",
      "peloponese",
    ]);
    expect(placeKeys("French Riviera (Côte d'Azur)")).toEqual(["french riviera", "cote d azur"]);
  });
});

describe("regionFor", () => {
  it("matches a sailing area to our region by name", () => {
    expect(
      regionFor(
        { countryCode: "HR", sailingAreas: ["Šibenik"], point: { lat: 43.73, lng: 15.9 } },
        regions,
      ),
    ).toBe("Šibenik region");
  });

  it("picks the nearer of two regions one sailing area names, through an alias", () => {
    const pula = { lat: 44.87, lng: 13.84 };
    const krk = { lat: 45.02, lng: 14.57 };

    expect(
      regionFor({ countryCode: "HR", sailingAreas: ["Istria / Kvarner"], point: pula }, regions),
    ).toBe("Istra");
    expect(
      regionFor({ countryCode: "HR", sailingAreas: ["Istria / Kvarner"], point: krk }, regions),
    ).toBe("Kvarner");
  });

  it("prefers the nearest region over a named one across the country", () => {
    const symi = { lat: 36.6159, lng: 27.8394 };

    expect(
      regionFor(
        { countryCode: "GR", sailingAreas: ["Athens / Saronic Gulf"], point: symi },
        regions,
      ),
    ).toBe("Dodecanese");
  });

  it("uses the nearest region for a base whose sailing area names none of ours", () => {
    expect(
      regionFor(
        { countryCode: "HR", sailingAreas: ["Kornati"], point: { lat: 43.8, lng: 15.63 } },
        regions,
      ),
    ).toBe("Šibenik region");
  });

  it("answers nothing when the nearest region is far away", () => {
    const lisbon = { lat: 38.69, lng: -9.21 };

    expect(
      regionFor({ countryCode: "PT", sailingAreas: ["European Atlantic"], point: lisbon }, regions),
    ).toBeUndefined();
  });

  it("never reaches into another country", () => {
    expect(
      regionFor(
        { countryCode: "SI", sailingAreas: ["Istria / Kvarner"], point: { lat: 45.5, lng: 13.6 } },
        regions,
      ),
    ).toBeUndefined();
  });

  it("still names our spelling of an aliased place no other vendor sails from", () => {
    expect(regionFor({ countryCode: "FR", sailingAreas: ["Bretagne"], point: undefined }, [])).toBe(
      "Brittany",
    );
  });
});
