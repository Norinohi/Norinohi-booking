import { describe, expect, it } from "vitest";

import {
  estimateFromWeeklyRates,
  priceListEstimateSource,
  rateRowEndsExclusive,
  shortCharterPremiumPercent,
} from "./weekly-estimate";

const nausys = "nausys";
const bookingManager = "booking_manager";

describe("estimateFromWeeklyRates", () => {
  it("prices a NauSYS charter at a seventh of the weekly rate per night", () => {
    const rows = [{ startDate: "2026-09-19", endDate: "2026-09-30", priceMinor: 700_000 }];
    expect(estimateFromWeeklyRates(rows, "2026-09-23", 5, nausys)).toBe(500_000);
  });

  it("adds Booking Manager's short-charter premium from four to six nights only", () => {
    const rows = [{ startDate: "2026-09-01", endDate: "2026-10-31", priceMinor: 700_000 }];
    expect(estimateFromWeeklyRates(rows, "2026-09-23", 4, bookingManager)).toBe(440_000);
    expect(estimateFromWeeklyRates(rows, "2026-09-23", 5, bookingManager)).toBe(525_000);
    expect(estimateFromWeeklyRates(rows, "2026-09-23", 6, bookingManager)).toBe(618_000);
    expect(estimateFromWeeklyRates(rows, "2026-09-23", 7, bookingManager)).toBe(700_000);
    expect(estimateFromWeeklyRates(rows, "2026-09-23", 10, bookingManager)).toBe(1_000_000);
  });

  it("rounds the summed weekly rates once, to a whole minor unit", () => {
    const rows = [{ startDate: "2026-09-19", endDate: "2026-09-30", priceMinor: 100_001 }];
    /* 6 x 100,001 / 7 = 85,715.14 */
    expect(estimateFromWeeklyRates(rows, "2026-09-23", 6, nausys)).toBe(85_715);
    /* 4 x 100,001 / 7 = 57,143.43, where rounding each night first would give 57,144 */
    expect(estimateFromWeeklyRates(rows, "2026-09-23", 4, nausys)).toBe(57_143);
    /* 4 x 100,001 x 1.10 / 7 = 62,857.77 */
    expect(estimateFromWeeklyRates(rows, "2026-09-23", 4, bookingManager)).toBe(62_858);
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
    /* Two nights at 100,000 and two at 200,000 */
    expect(estimateFromWeeklyRates(rows, "2026-10-08", 4, nausys)).toBe(600_000);
    expect(estimateFromWeeklyRates(rows, "2026-10-08", 4, bookingManager)).toBeNull();
  });

  it("takes the cheapest row where rows overlap a night", () => {
    const rows = [
      { startDate: "2026-10-01", endDate: "2026-10-31", priceMinor: 1_400_000 },
      { startDate: "2026-10-05", endDate: "2026-10-07", priceMinor: 700_000 },
    ];
    /* The band ends on its last night, so three nights at 100,000 and one at 200,000 */
    expect(estimateFromWeeklyRates(rows, "2026-10-05", 4, nausys)).toBe(500_000);
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

  it("ignores rows with no price, and estimates nothing under four nights", () => {
    const zero = [{ startDate: "2026-10-01", endDate: "2026-10-09", priceMinor: 0 }];
    expect(estimateFromWeeklyRates(zero, "2026-10-02", 4, nausys)).toBeNull();

    const rows = [{ startDate: "2026-10-01", endDate: "2026-10-31", priceMinor: 700_000 }];
    for (const nights of [0, 1, 2, 3]) {
      expect(estimateFromWeeklyRates(rows, "2026-10-02", nights, nausys)).toBeNull();
      expect(estimateFromWeeklyRates(rows, "2026-10-02", nights, bookingManager)).toBeNull();
    }
  });
});

describe("shortCharterPremiumPercent", () => {
  it("is Booking Manager's premium under a week and nothing anywhere else", () => {
    expect(shortCharterPremiumPercent("booking_manager", 4)).toBe(110);
    expect(shortCharterPremiumPercent("booking_manager", 8)).toBe(100);
    expect(shortCharterPremiumPercent("nausys", 4)).toBe(100);
  });
});

describe("priceListEstimateSource", () => {
  it("captions NauSYS short charters as a starting price and longer ones as before discounts", () => {
    expect(priceListEstimateSource("nausys", 6)).toBe("price-list-estimate-from");
    expect(priceListEstimateSource("nausys", 10)).toBe("price-list-estimate-before-discounts");
    expect(priceListEstimateSource("booking_manager", 5)).toBe("price-list-estimate");
    expect(priceListEstimateSource("booking_manager", 10)).toBe("price-list-estimate");
  });
});

describe("rateRowEndsExclusive", () => {
  it("reads Booking Manager rows as half-open and NauSYS bands as inclusive", () => {
    expect(rateRowEndsExclusive("booking_manager")).toBe(true);
    expect(rateRowEndsExclusive("nausys")).toBe(false);
  });
});
