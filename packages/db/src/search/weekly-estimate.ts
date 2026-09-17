import type { ProviderKey } from "@yacht-charter/env/providers";

import { shiftDays } from "./candidate-range";

/** The nights one weekly rate prices. */
export const WEEKLY_RATE_NIGHTS = 7;

/*
 * Booking Manager rows are one priced week, `[check-in, check-out)`, so a row does not cover the
 * day it ends on. NauSYS bands end on their last check-in day, so there the end day is covered.
 */
export const HALF_OPEN_RATE_PROVIDER: ProviderKey = "booking_manager";

export function rateRowEndsExclusive(provider: ProviderKey): boolean {
  return provider === HALF_OPEN_RATE_PROVIDER;
}

/** One offer's weekly price-list row, as `listing_price_period` holds it. */
export type WeeklyRateRow = {
  startDate: string;
  endDate: string;
  priceMinor: number;
  currency?: string;
};

/**
 * A charter's price estimated from one offer's weekly price list: each night costs the weekly rate
 * of the row covering that night divided by seven, summed over the nights, so a charter crossing
 * into another row pays each row's rate for the nights inside it. Where rows overlap a night the
 * cheapest covers it, as the list rate for a week is read.
 *
 * Rounded once, after summing: `Math.round(sum of weekly rates / 7)`, in whole minor units. The
 * sum is an integer, so the quotient never lands on a half and no tie rule is involved. The SQL
 * twin is `priceListEstimate` in `list-rate-sql.ts`, which rounds the same sum the same way.
 *
 * Null where any night has no row, where the nights' rows are in different currencies, or for a
 * length below one night. The figure is before discounts and obligatory extras.
 */
export function estimateFromWeeklyRates(
  rows: readonly WeeklyRateRow[],
  checkIn: string,
  nights: number,
  options: { endExclusive: boolean },
): number | null {
  if (!Number.isInteger(nights) || nights < 1) return null;

  let weeklySum = 0;
  let currency: string | undefined;
  for (let night = 0; night < nights; night++) {
    const day = shiftDays(checkIn, night);
    const covering = rows
      .filter(
        (row) =>
          row.priceMinor > 0 &&
          row.startDate <= day &&
          (options.endExclusive ? row.endDate > day : row.endDate >= day),
      )
      .toSorted((a, b) => a.priceMinor - b.priceMinor)[0];
    if (!covering) return null;
    if (night > 0 && covering.currency !== currency) return null;
    currency = covering.currency;
    weeklySum += covering.priceMinor;
  }
  return Math.round(weeklySum / WEEKLY_RATE_NIGHTS);
}
