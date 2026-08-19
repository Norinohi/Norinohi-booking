import { describe, expect, it } from "vitest";

import {
  type BookingManagerCatalogueCursor,
  parseBookingManagerCatalogueCursor,
  resumeCompanyIndex,
} from "./catalogue";

/*
 * The yacht sweep resumes by position in a company list, and the list is rebuilt on
 * every run. Narrowing the scope shrinks 1308 entries to one, at which point an old
 * index addresses nothing - and the failure is silent: the run sweeps zero yachts,
 * writes zero prices, reports success, and still retires every company it excluded.
 * That happened on production on 2026-08-19.
 */
describe("resumeCompanyIndex", () => {
  const cursor = (
    companyIndex: number,
    companyId?: string,
    step = 8,
  ): BookingManagerCatalogueCursor => ({ step, companyIndex, companyId });

  const fleet = ["101", "202", "303", "404"];

  it("resumes where it left off when the company is still at that index", () => {
    expect(resumeCompanyIndex(cursor(2, "303"), fleet)).toBe(2);
  });

  it("restarts when the scope narrowed under a cursor from a wider run", () => {
    // The production case: a cursor from a 1308-company walk against a list of one.
    expect(resumeCompanyIndex(cursor(600, "888"), ["225"])).toBe(0);
  });

  it("restarts when the list shifted and the index now names another company", () => {
    expect(resumeCompanyIndex(cursor(2, "303"), ["101", "999", "303", "404"])).toBe(2);
    expect(resumeCompanyIndex(cursor(2, "303"), ["999", "101", "202", "303"])).toBe(0);
  });

  it("does not trust a cursor written before the company id was recorded", () => {
    expect(resumeCompanyIndex(cursor(2, undefined), fleet)).toBe(0);
  });

  it("starts from the beginning when the cursor is not in the yacht step", () => {
    expect(resumeCompanyIndex(cursor(2, "303", 3), fleet)).toBe(0);
    expect(resumeCompanyIndex(null, fleet)).toBe(0);
  });

  it("starts from the beginning for a cursor pointing past the end", () => {
    expect(resumeCompanyIndex(cursor(9, "303"), fleet)).toBe(0);
  });
});

describe("parseBookingManagerCatalogueCursor", () => {
  it("keeps the company id when present", () => {
    expect(
      parseBookingManagerCatalogueCursor({ step: 8, companyIndex: 3, companyId: "404" }),
    ).toEqual({ step: 8, companyIndex: 3, companyId: "404" });
  });

  it("still reads a cursor written before the company id existed", () => {
    expect(parseBookingManagerCatalogueCursor({ step: 8, companyIndex: 3 })).toEqual({
      step: 8,
      companyIndex: 3,
    });
  });

  it("rejects a cursor it cannot read rather than guessing a position", () => {
    expect(parseBookingManagerCatalogueCursor({ step: -1 })).toBeNull();
    expect(parseBookingManagerCatalogueCursor("nonsense")).toBeNull();
  });
});
