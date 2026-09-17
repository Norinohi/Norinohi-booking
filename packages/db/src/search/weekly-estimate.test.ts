import { describe, expect, it } from "vitest";

import { estimateFromWeeklyRates, rateRowEndsExclusive } from "./weekly-estimate";

/* NauSYS bands name their last check-in day; Booking Manager rows are half-open weeks. */
const nausys = { endExclusive: false };
const bookingManager = { endExclusive: true };

describe("estimateFromWeeklyRates", () => {
  it("prices a short charter at a seventh of the weekly rate per night", () => {
    const rows = [{ startDate: "2026-09-19", endDate: "2026-09-25", priceMinor: 700_000 }];
    expect(estimateFromWeeklyRates(rows, "2026-09-23", 3, nausys)).toBe(300_000);
  });

  it("rounds the summed weekly rates once, to a whole minor unit", () => {
    const rows = [{ startDate: "2026-09-19", endDate: "2026-09-30", priceMinor: 100_001 }];
    /* 6 x 100,001 / 7 = 85,715.14 */
    expect(estimateFromWeeklyRates(rows, "2026-09-23", 6, nausys)).toBe(85_715);
    /* 4 x 100,001 / 7 = 57,143.43, where rounding each night first would give 57,144 */
    expect(estimateFromWeeklyRates(rows, "2026-09-23", 4, nausys)).toBe(57_143);
  });

  it("sums each night by the row covering it when a charter crosses rows", () => {
    const rows = [
      { startDate: "2026-10-03", endDate: "2026-10-10", priceMinor: 700_000 },
      { startDate: "2026-10-10", endDate: "2026-10-17", priceMinor: 350_000 },
    ];
    /* Four nights at 100,000 and six at 50,000 */
    expect(estimateFromWeeklyRates(rows, "2026-10-06", 10, bookingManager)).toBe(700_000);
  });

  it("covers the end day of a NauSYS band but not of a Booking Manager week", () => {
    const rows = [
      { startDate: "2026-10-03", endDate: "2026-10-09", priceMinor: 700_000 },
      { startDate: "2026-10-10", endDate: "2026-10-16", priceMinor: 1_400_000 },
    ];
    expect(estimateFromWeeklyRates(rows, "2026-10-08", 3, nausys)).toBe(400_000);
    expect(estimateFromWeeklyRates(rows, "2026-10-08", 3, bookingManager)).toBeNull();
  });

  it("takes the cheapest row where rows overlap a night", () => {
    const rows = [
      { startDate: "2026-10-01", endDate: "2026-10-31", priceMinor: 1_400_000 },
      { startDate: "2026-10-05", endDate: "2026-10-06", priceMinor: 700_000 },
    ];
    expect(estimateFromWeeklyRates(rows, "2026-10-05", 2, bookingManager)).toBe(300_000);
  });

  it("gives no estimate where a night has no row, or rows mix currencies", () => {
    const gap = [{ startDate: "2026-10-01", endDate: "2026-10-04", priceMinor: 700_000 }];
    expect(estimateFromWeeklyRates(gap, "2026-10-02", 5, nausys)).toBeNull();

    const mixed = [
      { startDate: "2026-10-01", endDate: "2026-10-03", priceMinor: 700_000, currency: "EUR" },
      { startDate: "2026-10-04", endDate: "2026-10-09", priceMinor: 700_000, currency: "USD" },
    ];
    expect(estimateFromWeeklyRates(mixed, "2026-10-02", 4, nausys)).toBeNull();
  });

  it("ignores rows with no price and lengths below a night", () => {
    const rows = [{ startDate: "2026-10-01", endDate: "2026-10-09", priceMinor: 0 }];
    expect(estimateFromWeeklyRates(rows, "2026-10-02", 2, nausys)).toBeNull();
    expect(
      estimateFromWeeklyRates(
        [{ startDate: "2026-10-01", endDate: "2026-10-09", priceMinor: 700_000 }],
        "2026-10-02",
        0,
        nausys,
      ),
    ).toBeNull();
  });
});

describe("rateRowEndsExclusive", () => {
  it("reads Booking Manager rows as half-open and NauSYS bands as inclusive", () => {
    expect(rateRowEndsExclusive("booking_manager")).toBe(true);
    expect(rateRowEndsExclusive("nausys")).toBe(false);
  });
});
