import type { ProviderKey } from "@yacht-charter/env/providers";

import { shiftDays } from "./candidate-range";
import type { PeriodPriceSource } from "./types";

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

/*
 * Below this a weekly list says too little about the charter to print a figure: measured against
 * live quotes (docs/qa/price-estimate-study-2026-09-17.md) two and three nights came out 17-29%
 * under the vendor's price, because operators charge a premium for them. Those cards stay on
 * request.
 */
export const MIN_ESTIMATED_NIGHTS = 4;

/*
 * The short-charter premium a vendor's own price carries over a seventh of the weekly rate per
 * night, in percent, by provider and length. Only Booking Manager: with it 63% of its four to six
 * night estimates landed within 10% of the quote instead of 52%. NauSYS premiums depend on the
 * operator and a factor made them worse, so its short estimates are captioned "from" instead.
 */
export const SHORT_CHARTER_PREMIUM_PERCENT = {
  booking_manager: new Map([
    [4, 110],
    [5, 105],
    [6, 103],
  ]),
} satisfies Partial<Record<ProviderKey, ReadonlyMap<number, number>>>;

export function shortCharterPremiumPercent(provider: ProviderKey, nights: number): number {
  if (provider !== "booking_manager") return 100;
  return SHORT_CHARTER_PREMIUM_PERCENT[provider].get(nights) ?? 100;
}

export type PriceListEstimateSource = Extract<PeriodPriceSource, `price-list-estimate${string}`>;

/**
 * How a card may caption an estimate. NauSYS lists are before the discounts it sells at, so from
 * a week up the quote is never above the estimate; under a week its operators' premiums vary
 * enough that the figure is only a starting point. Booking Manager's list matches its quotes.
 */
export function priceListEstimateSource(
  provider: ProviderKey,
  nights: number,
): PriceListEstimateSource {
  if (provider !== "nausys") return "price-list-estimate";
  return nights < WEEKLY_RATE_NIGHTS
    ? "price-list-estimate-from"
    : "price-list-estimate-before-discounts";
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
 * The provider's short-charter premium (`shortCharterPremiumPercent`) is applied to the sum, and
 * the result rounded once: `Math.round(sum of weekly rates * percent / 700)`, in whole minor
 * units. Rounding half up here and half away from zero in SQL agree, as the value is positive. The
 * SQL twin is `priceListEstimate` in `list-rate-sql.ts`.
 *
 * Null where any night has no row, where the nights' rows are in different currencies, or for a
 * length below `MIN_ESTIMATED_NIGHTS`. The figure is before discounts and obligatory extras.
 */
export function estimateFromWeeklyRates(
  rows: readonly WeeklyRateRow[],
  checkIn: string,
  nights: number,
  provider: ProviderKey,
): number | null {
  if (!Number.isInteger(nights) || nights < MIN_ESTIMATED_NIGHTS) return null;
  const endExclusive = rateRowEndsExclusive(provider);

  let weeklySum = 0;
  let currency: string | undefined;
  for (let night = 0; night < nights; night++) {
    const day = shiftDays(checkIn, night);
    const covering = rows
      .filter(
        (row) =>
          row.priceMinor > 0 &&
          row.startDate <= day &&
          (endExclusive ? row.endDate > day : row.endDate >= day),
      )
      .toSorted((a, b) => a.priceMinor - b.priceMinor)[0];
    if (!covering) return null;
    if (night > 0 && covering.currency !== currency) return null;
    currency = covering.currency;
    weeklySum += covering.priceMinor;
  }
  return Math.round(
    (weeklySum * shortCharterPremiumPercent(provider, nights)) / (WEEKLY_RATE_NIGHTS * 100),
  );
}
