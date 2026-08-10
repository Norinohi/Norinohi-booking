import { describe, expect, it } from "vitest";

import { ContractError } from "./errors";
import { currencyExponent, decimalStringToMinor, minorToDecimalString } from "./money";

describe("currencyExponent", () => {
  it("defaults to 2 and knows the 0 and 3 exponent currencies", () => {
    expect(currencyExponent("EUR")).toBe(2);
    expect(currencyExponent("hrk")).toBe(2);
    expect(currencyExponent("XYZ")).toBe(2);
    for (const currency of ["JPY", "KRW", "VND", "CLP", "ISK"]) {
      expect(currencyExponent(currency)).toBe(0);
    }
    for (const currency of ["BHD", "JOD", "KWD", "OMR", "TND"]) {
      expect(currencyExponent(currency)).toBe(3);
    }
  });
});

describe("decimalStringToMinor", () => {
  it("parses the shapes NauSYS actually sends", () => {
    expect(decimalStringToMinor("3340.00", "EUR")).toBe(334000);
    expect(decimalStringToMinor("3340.5", "EUR")).toBe(334050);
    expect(decimalStringToMinor("3340", "EUR")).toBe(334000);
    expect(decimalStringToMinor("0.00", "EUR")).toBe(0);
    expect(decimalStringToMinor("0.07", "EUR")).toBe(7);
  });

  it("handles signs and surrounding whitespace", () => {
    expect(decimalStringToMinor("-12.34", "EUR")).toBe(-1234);
    expect(decimalStringToMinor("+12.34", "EUR")).toBe(1234);
    expect(decimalStringToMinor("  3340.00  ", "EUR")).toBe(334000);
    expect(Object.is(decimalStringToMinor("-0.00", "EUR"), 0)).toBe(true);
  });

  it("truncates extra precision toward zero", () => {
    expect(decimalStringToMinor("1234.567", "EUR")).toBe(123456);
    expect(decimalStringToMinor("1234.999", "EUR")).toBe(123499);
    expect(decimalStringToMinor("-1234.567", "EUR")).toBe(-123456);
  });

  it("respects the currency exponent", () => {
    expect(decimalStringToMinor("3340", "JPY")).toBe(3340);
    expect(decimalStringToMinor("3340.75", "JPY")).toBe(3340);
    expect(decimalStringToMinor("3340.5", "KWD")).toBe(3340500);
    expect(decimalStringToMinor("3340", "BHD")).toBe(3340000);
  });

  it("never loses a cent to floating point", () => {
    expect(decimalStringToMinor("0.29", "EUR")).toBe(29);
    expect(decimalStringToMinor("1.005", "EUR")).toBe(100);
    expect(decimalStringToMinor("8.87", "EUR")).toBe(887);
  });

  it("throws ContractError on anything non-numeric", () => {
    for (const value of ["", " ", "abc", "3,340.00", "3340.", ".5", "1e3", "3 340", "NaN", "--1"]) {
      expect(() => decimalStringToMinor(value, "EUR")).toThrow(ContractError);
    }
    expect(() => decimalStringToMinor(null as unknown as string, "EUR")).toThrow(ContractError);
    expect(() => decimalStringToMinor(3340 as unknown as string, "EUR")).toThrow(ContractError);
    expect(() => decimalStringToMinor("999999999999999999.00", "EUR")).toThrow(ContractError);
  });
});

describe("minorToDecimalString", () => {
  it("inverts decimalStringToMinor", () => {
    expect(minorToDecimalString(334000, "EUR")).toBe("3340.00");
    expect(minorToDecimalString(334050, "EUR")).toBe("3340.50");
    expect(minorToDecimalString(0, "EUR")).toBe("0.00");
    expect(minorToDecimalString(7, "EUR")).toBe("0.07");
    expect(minorToDecimalString(-1234, "EUR")).toBe("-12.34");
    expect(minorToDecimalString(3340, "JPY")).toBe("3340");
    expect(minorToDecimalString(3340500, "KWD")).toBe("3340.500");
    expect(minorToDecimalString(5, "KWD")).toBe("0.005");
  });

  it("round-trips", () => {
    for (const value of ["3340.00", "0.00", "-12.34", "1.01", "999999.99"]) {
      expect(minorToDecimalString(decimalStringToMinor(value, "EUR"), "EUR")).toBe(value);
    }
  });

  it("rejects non-integer minor amounts", () => {
    expect(() => minorToDecimalString(12.5, "EUR")).toThrow(ContractError);
    expect(() => minorToDecimalString(Number.NaN, "EUR")).toThrow(ContractError);
  });
});
