import { describe, expect, it } from "vitest";

import { MAP_MAX_ZOOM, staticMapFrame, staticMapUrl, stillPositionStyle } from "./mapbox";

const SIZE = { width: 600, height: 400 };

const zoomOf = (url: string) => Number(url.split("/static/")[1].split("/")[0].split(",")[2]);

describe("staticMapUrl", () => {
  it("puts longitude first and carries the token", () => {
    expect(staticMapUrl({ lat: 43.5, lng: 16.44 })).toBe(
      "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/static/16.44,43.5,13/480x320@2x?access_token=pk.test",
    );
  });
});

describe("staticMapFrame", () => {
  it("orders the still with a rounded centre and zoom, so server and browser agree", () => {
    const frame = staticMapFrame(
      [
        { lat: 43.51, lng: 16.25 },
        { lat: 43.06, lng: 16.38 },
      ],
      SIZE,
    );
    expect(frame.url).toMatch(/\/static\/-?\d+(\.\d{1,6})?,-?\d+(\.\d{1,6})?,\d+(\.\d{1,2})?\//);
  });

  it("centres a lone point at street level", () => {
    const frame = staticMapFrame([{ lat: 43.5, lng: 16.44 }], SIZE);

    expect(zoomOf(frame.url)).toBe(12);
    expect(frame.markers[0].leftPercent).toBeCloseTo(50);
    expect(frame.markers[0].topPercent).toBeCloseTo(50);
  });

  it("keeps every marker inside the still", () => {
    const frame = staticMapFrame(
      [
        { lat: 43.5, lng: 16.44 },
        { lat: 42.65, lng: 18.09 },
        { lat: 45.33, lng: 14.44 },
      ],
      SIZE,
    );

    for (const marker of frame.markers) {
      expect(marker.leftPercent).toBeGreaterThanOrEqual(0);
      expect(marker.leftPercent).toBeLessThanOrEqual(100);
      expect(marker.topPercent).toBeGreaterThanOrEqual(0);
      expect(marker.topPercent).toBeLessThanOrEqual(100);
    }
  });

  it("puts north above south and west left of east", () => {
    const [north, south] = staticMapFrame(
      [
        { lat: 44, lng: 15 },
        { lat: 43, lng: 16 },
      ],
      SIZE,
    ).markers;

    expect(north.topPercent).toBeLessThan(south.topPercent);
    expect(north.leftPercent).toBeLessThan(south.leftPercent);
  });

  it("caps the zoom for points almost on top of each other", () => {
    const frame = staticMapFrame(
      [
        { lat: 43.5, lng: 16.44 },
        { lat: 43.500_000_1, lng: 16.440_000_1 },
      ],
      SIZE,
    );

    expect(zoomOf(frame.url)).toBe(MAP_MAX_ZOOM);
  });
});

describe("stillPositionStyle", () => {
  it("rounds to what the browser reads a server style back as", () => {
    expect(
      stillPositionStyle({ leftPercent: 45.79071999116571, topPercent: 11.666666666666643 }),
    ).toEqual({ left: "45.791%", top: "11.667%" });
  });

  it("drops trailing zeros and keeps negatives", () => {
    expect(stillPositionStyle({ leftPercent: 50, topPercent: -3.10004 })).toEqual({
      left: "50%",
      top: "-3.1%",
    });
  });
});
