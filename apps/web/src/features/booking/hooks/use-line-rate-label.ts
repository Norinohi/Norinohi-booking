"use client";

import { useExtraPrice } from "@/hooks/use-extra-price";

import { type RateSource, vendorRateFor } from "../lib/line-rate";

/**
 * "1,33 EUR per night" under a quote line whose total the vendor built from a unit rate, or null.
 * See `vendorRateFor` for why the unit comes from the catalogue and never from the fee's name.
 */
export function useLineRateLabel(catalogue: readonly RateSource[] | undefined) {
  const extraPrice = useExtraPrice({ exact: true });

  return (line: { code: string; amount: { amountMinor: number; currency: string } }) => {
    const rate = catalogue ? vendorRateFor(line, catalogue) : null;
    return rate ? extraPrice(rate.amountMinor, rate.measure, null, rate.currency) : null;
  };
}
