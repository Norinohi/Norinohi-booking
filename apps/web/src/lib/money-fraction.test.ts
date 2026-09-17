import { describe, expect, it } from "vitest";

import { exactFractionDigits } from "./money-fraction";

describe("exactFractionDigits", () => {
  it("keeps a whole amount whole", () => {
    expect(exactFractionDigits(108000)).toBe(0);
    expect(exactFractionDigits(0)).toBe(0);
    expect(exactFractionDigits(-47300)).toBe(0);
  });

  it("shows both digits whenever there are cents", () => {
    expect(exactFractionDigits(108931)).toBe(2);
    expect(exactFractionDigits(931)).toBe(2);
    expect(exactFractionDigits(108910)).toBe(2);
    expect(exactFractionDigits(-5)).toBe(2);
  });

  it("formats 1,089.31 as the staff screen does", () => {
    const digits = exactFractionDigits(108931);
    const text = new Intl.NumberFormat("uk", {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(1089.31);
    expect(text).toContain("089,31");
  });
});
