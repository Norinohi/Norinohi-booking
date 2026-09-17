import { createLoader } from "nuqs/server";
import { describe, expect, it } from "vitest";

import {
  detailPeriodParsers,
  filterParsers,
  mapCameraParsers,
  serializeDetailPeriod,
  serializeMapCamera,
  serializeSearch,
} from "./search-params";

const loadFilters = createLoader(filterParsers);
const loadCamera = createLoader(mapCameraParsers);
const loadPeriod = createLoader(detailPeriodParsers);

describe("filterParsers", () => {
  it("falls back to defaults on an empty query", () => {
    const filters = loadFilters("");

    expect(filters.duration).toBe("any");
    expect(filters.dateFlexibility).toBe("on-day");
    expect(filters.yearFrom).toBe("any");
    expect(filters.country).toEqual([]);
    expect(filters.guests).toBeNull();
    expect(filters.length).toBeNull();
    expect(filters.petsAllowed).toBe(false);
  });

  describe("duration", () => {
    it.each(["1", "7", "365"])("keeps %s nights", (nights) => {
      expect(loadFilters(`?duration=${nights}`).duration).toBe(nights);
    });

    it.each(["0", "366", "-7", "7.5", "seven", "", "0x10", "1e1", "7.0", " 7 "])(
      "drops %j back to any",
      (nights) => {
        expect(loadFilters(`?duration=${nights}`).duration).toBe("any");
      },
    );

    it("reads a zero-padded count as the plain number", () => {
      expect(loadFilters("?duration=07").duration).toBe("7");
    });

    it("round-trips through the serializer", () => {
      const href = serializeSearch("/yachts", { duration: "14" });

      expect(href).toBe("/yachts?duration=14");
      expect(loadFilters(href.slice("/yachts".length)).duration).toBe("14");
    });
  });

  describe("ranges", () => {
    it("parses a pair and orders a crossed one", () => {
      expect(loadFilters("?cabins=2,4").cabins).toEqual([2, 4]);
      expect(loadFilters("?cabins=4,2").cabins).toEqual([2, 4]);
    });

    it("rejects the wrong arity, non-numbers and negatives", () => {
      expect(loadFilters("?cabins=2").cabins).toBeNull();
      expect(loadFilters("?cabins=1,2,3").cabins).toBeNull();
      expect(loadFilters("?cabins=a,2").cabins).toBeNull();
      expect(loadFilters("?price=-1,100").price).toBeNull();
    });

    it("rejects an empty side or an odd spelling instead of reading a zero", () => {
      expect(loadFilters("?cabins=,").cabins).toBeNull();
      expect(loadFilters("?cabins=,4").cabins).toBeNull();
      expect(loadFilters("?berths= 2,4").berths).toBeNull();
      expect(loadFilters("?price=0x10,100").price).toBeNull();
      expect(loadFilters("?length=1e1,20").length).toBeNull();
    });

    it("keeps a real zero lower bound", () => {
      expect(loadFilters("?price=0,500").price).toEqual([0, 500]);
    });

    it("keeps fractional feet but not fractional cabins", () => {
      expect(loadFilters("?length=30.5,45").length).toEqual([30.5, 45]);
      expect(loadFilters("?cabins=2.5,4").cabins).toBeNull();
    });

    it("bounds a guest rating at five", () => {
      expect(loadFilters("?guestRating=4,5").guestRating).toEqual([4, 5]);
      expect(loadFilters("?guestRating=4,6").guestRating).toBeNull();
    });
  });

  it("accepts only real calendar days", () => {
    expect(loadFilters("?startDate=2030-07-04").startDate).toBe("2030-07-04");
    expect(loadFilters("?startDate=2026-13-40").startDate).toBeNull();
    expect(loadFilters("?startDate=4.7.2026").startDate).toBeNull();
    expect(loadFilters("?startDate=2026-02-31").startDate).toBeNull();
    expect(loadFilters("?startDate=2032-02-29").startDate).toBe("2032-02-29");
  });

  it("drops a start date already in the past", () => {
    expect(loadFilters("?startDate=2020-06-06").startDate).toBeNull();
  });

  it("accepts a known date flexibility only", () => {
    expect(loadFilters("?dateFlexibility=1-week").dateFlexibility).toBe("1-week");
    expect(loadFilters("?dateFlexibility=forever").dateFlexibility).toBe("on-day");
  });

  it("accepts four-digit years or any", () => {
    expect(loadFilters("?yearFrom=2015").yearFrom).toBe("2015");
    expect(loadFilters("?yearFrom=15").yearFrom).toBe("any");
  });

  it("accepts positive whole guest counts only", () => {
    expect(loadFilters("?guests=6").guests).toBe(6);
    expect(loadFilters("?guests=0").guests).toBeNull();
    expect(loadFilters("?guests=2.5").guests).toBeNull();
    expect(loadFilters("?guests=0x6").guests).toBeNull();
  });

  it("reads comma-separated multi-selects", () => {
    expect(loadFilters("?country=croatia,greece").country).toEqual(["croatia", "greece"]);
  });
});

describe("mapCameraParsers", () => {
  it("reads centre as longitude first", () => {
    const camera = loadCamera("?zoom=9&centre=16.44,43.5");

    expect(camera.zoom).toBe(9);
    expect(camera.centre).toEqual({ lng: 16.44, lat: 43.5 });
  });

  it.each([
    ["the latitude edge", "0,90", { lng: 0, lat: 90 }],
    ["the longitude edge", "-180,-90", { lng: -180, lat: -90 }],
  ])("accepts %s", (_label, query, expected) => {
    expect(loadCamera(`?centre=${query}`).centre).toEqual(expected);
  });

  it.each([
    ["latitude past 90", "16,90.1"],
    ["longitude past 180", "180.5,43"],
    ["a missing latitude", "16.44"],
    ["text", "split,croatia"],
    ["empty parts", ","],
    ["an empty longitude", ",43.5"],
    ["a third part", "16,43,99"],
    ["a hex spelling", "0x10,43"],
  ])("rejects %s", (_label, query) => {
    expect(loadCamera(`?centre=${query}`).centre).toBeNull();
  });

  it("serializes to five decimals, longitude first", () => {
    expect(serializeMapCamera({ zoom: 9, centre: { lat: 43.5, lng: 16.44 } })).toBe(
      "?zoom=9&centre=16.44000,43.50000",
    );
  });

  it("round-trips a serialized camera", () => {
    const query = serializeMapCamera({ centre: { lat: 43.508_12, lng: 16.440_21 } });

    expect(loadCamera(query).centre).toEqual({ lat: 43.508_12, lng: 16.440_21 });
  });
});

describe("detail period", () => {
  it("round-trips check-in and check-out", () => {
    const href = serializeDetailPeriod("/yachts/some-boat", {
      checkIn: "2026-07-04",
      checkOut: "2026-07-11",
    });

    expect(href).toBe("/yachts/some-boat?checkIn=2026-07-04&checkOut=2026-07-11");
    expect(loadPeriod(href.slice(href.indexOf("?")))).toEqual({
      checkIn: "2026-07-04",
      checkOut: "2026-07-11",
    });
  });
});
