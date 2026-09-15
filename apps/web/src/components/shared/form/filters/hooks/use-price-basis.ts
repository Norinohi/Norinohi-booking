"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

export const PRICE_BASIS_OPTIONS = ["boat", "charter"] as const;
export type PriceBasisOption = (typeof PRICE_BASIS_OPTIONS)[number];
export type PriceBasis = "base" | "all_in";

const TO_BASIS = { boat: "base", charter: "all_in" } as const satisfies Record<
  PriceBasisOption,
  PriceBasis
>;

/**
 * Which price the catalogue's cards show: the boat alone, which is the default, or the whole
 * charter with its obligatory pack.
 *
 * The visitor's choice rides in the URL as `?price=`, so it survives paging, reloads and a shared
 * link. Without one `explicit` stays null and the request carries no basis: the server defaults to
 * the boat price too, and leaving the field off keeps the query key identical to the one the
 * server prefetched rather than refetching every result page on hydration.
 */
export function usePriceBasis() {
  const [param, setParam] = useQueryState("price", parseAsStringLiteral(PRICE_BASIS_OPTIONS));
  const option: PriceBasisOption = param ?? "boat";

  return {
    option,
    basis: TO_BASIS[option],
    explicit: param === "charter" ? TO_BASIS.charter : null,
    setOption: (next: PriceBasisOption) => setParam(next === "boat" ? null : next),
  };
}
