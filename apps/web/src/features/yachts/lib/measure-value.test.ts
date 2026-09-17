import { describe, expect, it } from "vitest";

import { localizeMeasure, type UnitFormatter } from "./measure-value";

const formatterFor =
  (locale: string): UnitFormatter =>
  (value, unit) =>
    new Intl.NumberFormat(locale, { style: "unit", unit, unitDisplay: "short" }).format(value);

describe("localizeMeasure", () => {
  it("writes the number in the page's notation", () => {
    expect(localizeMeasure("12.70 m", formatterFor("de"))).toBe("12,7 m");
    expect(localizeMeasure("12.35 m", formatterFor("en"))).toBe("12.35 m");
    expect(localizeMeasure("300 l", formatterFor("de"))).toBe("300 l");
  });

  it("uses the locale's own unit symbol", () => {
    expect(localizeMeasure("12.35 m", formatterFor("uk"))).toBe("12,35 м");
  });

  it("leaves anything else as the API wrote it", () => {
    expect(localizeMeasure("2 x 40 hp", formatterFor("de"))).toBe("2 x 40 hp");
    expect(localizeMeasure("Split, Croatia", formatterFor("de"))).toBe("Split, Croatia");
  });
});
