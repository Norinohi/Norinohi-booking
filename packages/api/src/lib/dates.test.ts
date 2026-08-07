import { describe, expect, it } from "vitest";

import { daysBetween, effectivePeriod } from "./dates";

describe("daysBetween", () => {
  it("counts the nights in a charter week", () => {
    expect(daysBetween("2026-08-08", "2026-08-15")).toBe(7);
  });

  it("counts a single night", () => {
    expect(daysBetween("2026-08-08", "2026-08-09")).toBe(1);
  });

  it("returns null when either end is missing", () => {
    expect(daysBetween(null, "2026-08-15")).toBeNull();
    expect(daysBetween("2026-08-08", null)).toBeNull();
    expect(daysBetween(null, null)).toBeNull();
  });

  it("returns null rather than zero for a same-day range", () => {
    // Callers fall back to another source for the period, so zero would read as
    // a real answer and stop the fallback.
    expect(daysBetween("2026-08-08", "2026-08-08")).toBeNull();
  });

  it("returns null for a reversed range", () => {
    expect(daysBetween("2026-08-15", "2026-08-08")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(daysBetween("not a date", "2026-08-15")).toBeNull();
    expect(daysBetween("2026-13-45", "2026-08-15")).toBeNull();
    expect(daysBetween("", "2026-08-15")).toBeNull();
  });

  it("counts across a month and a year boundary", () => {
    expect(daysBetween("2026-01-28", "2026-02-04")).toBe(7);
    expect(daysBetween("2026-12-28", "2027-01-04")).toBe(7);
  });

  it("counts across a leap day", () => {
    expect(daysBetween("2028-02-27", "2028-03-01")).toBe(3);
  });

  it("is unaffected by a DST transition, being parsed as UTC", () => {
    // Europe/Brussels springs forward on 2026-03-29.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});

describe("effectivePeriod", () => {
  it("prefers an explicit pair and drops the duration", () => {
    expect(effectivePeriod({ checkIn: "2026-08-08", checkOut: "2026-08-15", duration: 3 })).toEqual(
      { checkIn: "2026-08-08", checkOut: "2026-08-15", duration: undefined },
    );
  });

  it("derives the checkout from a start date plus nights", () => {
    expect(effectivePeriod({ startDate: "2026-08-08", duration: 7 })).toEqual({
      checkIn: "2026-08-08",
      checkOut: "2026-08-15",
      duration: 7,
    });
  });

  it("round-trips with daysBetween", () => {
    const period = effectivePeriod({ startDate: "2026-08-08", duration: 10 });
    expect(daysBetween(period.checkIn ?? null, period.checkOut ?? null)).toBe(10);
  });

  it("crosses month and year boundaries", () => {
    expect(effectivePeriod({ startDate: "2026-12-28", duration: 7 }).checkOut).toBe("2027-01-04");
    expect(effectivePeriod({ startDate: "2028-02-27", duration: 3 }).checkOut).toBe("2028-03-01");
  });

  it("passes the duration through when there is no start date to anchor it", () => {
    expect(effectivePeriod({ duration: 7 })).toEqual({
      checkIn: undefined,
      checkOut: undefined,
      duration: 7,
    });
  });

  it("yields nothing usable when only half a pair is given", () => {
    expect(effectivePeriod({ checkIn: "2026-08-08" })).toEqual({
      checkIn: undefined,
      checkOut: undefined,
      duration: undefined,
    });
    expect(effectivePeriod({ startDate: "2026-08-08" })).toEqual({
      checkIn: undefined,
      checkOut: undefined,
      duration: undefined,
    });
  });

  it("returns nothing for empty input", () => {
    expect(effectivePeriod({})).toEqual({
      checkIn: undefined,
      checkOut: undefined,
      duration: undefined,
    });
  });
});
