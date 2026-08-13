import { describe, expect, it } from "vitest";

import { contractViolation } from "../testing/contracts";

import { formatNausysDate, parseNausysDate, parseNausysDateTime } from "./dates";
import { ContractError } from "./errors";

describe("parseNausysDate", () => {
  it("converts dd.MM.yyyy to ISO", () => {
    expect(parseNausysDate("08.08.2026")).toBe("2026-08-08");
    expect(parseNausysDate("01.01.2026")).toBe("2026-01-01");
    expect(parseNausysDate("31.12.2026")).toBe("2026-12-31");
    expect(parseNausysDate("29.02.2028")).toBe("2028-02-29");
    expect(parseNausysDate(" 08.08.2026 ")).toBe("2026-08-08");
  });

  it("round-trips with formatNausysDate", () => {
    for (const value of ["08.08.2026", "29.02.2028", "01.03.2026"]) {
      expect(formatNausysDate(parseNausysDate(value))).toBe(value);
    }
    for (const value of ["2026-08-08", "2028-02-29", "2026-10-25"]) {
      expect(parseNausysDate(formatNausysDate(value))).toBe(value);
    }
  });

  it("throws ContractError rather than misparsing", () => {
    for (const value of [
      "32.01.2026",
      "2026-08-08",
      "29.02.2027",
      "00.01.2026",
      "01.13.2026",
      "8.8.2026",
      "08.08.26",
      "",
      "not a date",
    ]) {
      expect(() => parseNausysDate(value)).toThrow(ContractError);
    }
    expect(() => parseNausysDate(contractViolation(undefined))).toThrow(ContractError);
  });
});

describe("formatNausysDate", () => {
  it("converts ISO to dd.MM.yyyy", () => {
    expect(formatNausysDate("2026-08-08")).toBe("08.08.2026");
    expect(formatNausysDate("2028-02-29")).toBe("29.02.2028");
  });

  it("rejects malformed ISO input", () => {
    for (const value of ["08.08.2026", "2026-02-30", "2026-8-8", "2026-08-08T00:00:00Z", "x"]) {
      expect(() => formatNausysDate(value)).toThrow(ContractError);
    }
  });
});

describe("parseNausysDateTime", () => {
  it("reads the wall clock in the given zone", () => {
    expect(parseNausysDateTime("08.08.2026 17:00", "Europe/Zagreb").toISOString()).toBe(
      "2026-08-08T15:00:00.000Z",
    );
    expect(parseNausysDateTime("15.01.2026 09:30", "Europe/Zagreb").toISOString()).toBe(
      "2026-01-15T08:30:00.000Z",
    );
    expect(parseNausysDateTime("15.01.2026 09:30", "UTC").toISOString()).toBe(
      "2026-01-15T09:30:00.000Z",
    );
  });

  it("accepts the optional seconds component", () => {
    expect(parseNausysDateTime("08.08.2026 17:00:45", "Europe/Zagreb").toISOString()).toBe(
      "2026-08-08T15:00:45.000Z",
    );
  });

  it("handles the leap day", () => {
    expect(parseNausysDateTime("29.02.2028 12:00", "Europe/Zagreb").toISOString()).toBe(
      "2028-02-29T11:00:00.000Z",
    );
  });

  it("resolves both Europe/Zagreb DST boundaries deterministically", () => {
    // Spring forward: 02:30 local does not exist, it shifts to 03:30 CEST.
    expect(parseNausysDateTime("29.03.2026 02:30", "Europe/Zagreb").toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    expect(parseNausysDateTime("29.03.2026 01:30", "Europe/Zagreb").toISOString()).toBe(
      "2026-03-29T00:30:00.000Z",
    );
    expect(parseNausysDateTime("29.03.2026 03:30", "Europe/Zagreb").toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );

    // Fall back: 02:30 local happens twice. We take the EARLIER (CEST)
    // occurrence, because these are mostly deadlines and reading a deadline an
    // hour late is what lets us sell a slot the provider already released.
    expect(parseNausysDateTime("25.10.2026 02:30", "Europe/Zagreb").toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
    expect(parseNausysDateTime("25.10.2026 01:30", "Europe/Zagreb").toISOString()).toBe(
      "2026-10-24T23:30:00.000Z",
    );
    expect(parseNausysDateTime("25.10.2026 04:30", "Europe/Zagreb").toISOString()).toBe(
      "2026-10-25T03:30:00.000Z",
    );
  });

  it("throws ContractError on malformed input", () => {
    for (const value of [
      "08.08.2026",
      "2026-08-08 17:00",
      "32.01.2026 10:00",
      "08.08.2026 24:00",
      "08.08.2026 17:60",
      "08.08.2026 5:00",
      "",
    ]) {
      expect(() => parseNausysDateTime(value, "Europe/Zagreb")).toThrow(ContractError);
    }
    expect(() => parseNausysDateTime(contractViolation(null), "Europe/Zagreb")).toThrow(
      ContractError,
    );
  });

  it("throws ContractError on an unknown time zone", () => {
    expect(() => parseNausysDateTime("08.08.2026 17:00", "Mars/Olympus")).toThrow(ContractError);
  });
});
