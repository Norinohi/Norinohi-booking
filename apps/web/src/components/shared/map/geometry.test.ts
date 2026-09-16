import { describe, expect, it } from "vitest";

import { type Padding, samePadding } from "./camera";
import { boundsOf, toPosition } from "./geometry";

describe("boundsOf", () => {
  it("frames every point as west-south, east-north", () => {
    const box = boundsOf([
      { lat: 43.5, lng: 16.44 },
      { lat: 42.65, lng: 18.09 },
      { lat: 45.33, lng: 14.44 },
    ]);

    expect(box).toEqual([
      [14.44, 42.65],
      [18.09, 45.33],
    ]);
  });

  it("collapses to the point itself for a single point", () => {
    expect(boundsOf([{ lat: 43.5, lng: 16.44 }])).toEqual([
      [16.44, 43.5],
      [16.44, 43.5],
    ]);
  });

  it("handles negative coordinates", () => {
    expect(
      boundsOf([
        { lat: -33.9, lng: -77.3 },
        { lat: 25.05, lng: -77.35 },
      ]),
    ).toEqual([
      [-77.35, -33.9],
      [-77.3, 25.05],
    ]);
  });
});

describe("toPosition", () => {
  it("puts longitude first, as GeoJSON does", () => {
    expect(toPosition({ lat: 43.5, lng: 16.44 })).toEqual([16.44, 43.5]);
  });
});

describe("samePadding", () => {
  const padding: Padding = { top: 10, right: 400, bottom: 0, left: 24 };
  const sides: (keyof Padding)[] = ["top", "right", "bottom", "left"];

  it("is true for equal sides", () => {
    expect(samePadding(padding, { ...padding })).toBe(true);
  });

  it.each(sides)("notices a change on %s", (side) => {
    expect(samePadding(padding, { ...padding, [side]: padding[side] + 1 })).toBe(false);
  });
});
