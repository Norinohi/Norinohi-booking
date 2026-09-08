"use client";

import { useFormatter } from "next-intl";

import { useConvertPrice } from "@/components/layout/currency-provider";

/*
 * Money as this visitor reads it: the amount a vendor published, in the currency they published
 * it in, unless the marketplace is showing prices converted and a fresh rate covers both.
 *
 * The currency argument is the published one and stays required in spirit -- the catalogue is
 * not priced in one currency, and rendering a USD 7,619 figure under a euro sign is a different
 * number rather than a formatting slip. The default is for the quote-shaped callers, whose
 * figures already came back in one agreed currency.
 *
 * A converted figure is approximate by nature: ECB reference rates are not what a card network
 * applies, so `useApproximateMoney` exists for the places that should say so, and the payment
 * screen states the real charge regardless.
 */
export function useMoney() {
  const format = useFormatter();
  const convert = useConvertPrice();

  return (amountMinor: number, currency = "EUR") => {
    const shown = convert(amountMinor, currency);
    return format.number(shown.amountMinor / 100, {
      style: "currency",
      currency: shown.currency,
      maximumFractionDigits: 0,
    });
  };
}

/** The same figure, plus whether it is a conversion, for callers that mark one. */
export function useApproximateMoney() {
  const format = useFormatter();
  const convert = useConvertPrice();

  return (amountMinor: number, currency = "EUR") => {
    const shown = convert(amountMinor, currency);
    return {
      text: format.number(shown.amountMinor / 100, {
        style: "currency",
        currency: shown.currency,
        maximumFractionDigits: 0,
      }),
      approximate: shown.approximate,
    };
  };
}
