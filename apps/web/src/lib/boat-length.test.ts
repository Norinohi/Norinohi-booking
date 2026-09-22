import { describe, expect, it } from "vitest";

import { formatBoatLength, formatBoatLengthRange } from "./boat-length";

const formatIn = (locale: string) => ({
  number: (value: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(locale, options).format(value),
});

describe("formatBoatLength", () => {
  it("puts whole feet first and metres to a decimal second", () => {
    expect(formatBoatLength(formatIn("en"), 11.3)).toBe("37 ft / 11.3 m");
    expect(formatBoatLength(formatIn("en"), 13.72)).toBe("45 ft / 13.7 m");
  });

  it("follows the locale's separator and unit symbols", () => {
    expect(formatBoatLength(formatIn("uk"), 11.3)).toBe("37 фт / 11,3 м");
  });
});

describe("formatBoatLengthRange", () => {
  it("prints the feet the filter holds and the metres they stand for", () => {
    expect(formatBoatLengthRange(formatIn("en"), [38, 61])).toBe("38-61 ft / 11.6-18.6 m");
  });
});
