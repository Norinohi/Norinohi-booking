"use client";

import { createSerializer, parseAsStringLiteral } from "nuqs/server";

import {
  PRICE_BASIS_OPTIONS,
  type PriceBasisOption,
} from "@/components/shared/form/filters/hooks/use-price-basis";
import type { AppPathname } from "@/i18n/navigation";

import { serializeSearch } from "./search-params";

const serializePricing = createSerializer({ pricing: parseAsStringLiteral(PRICE_BASIS_OPTIONS) });

export type SearchCriteria = {
  guests?: number | null;
  minBerths?: number | null;
  country?: string[];
  sailingArea?: string[];
  marina?: string[];
  boatType?: string[];
  crew?: string[];
  startDate?: string | null;
  duration?: string;
  price?: [number, number];
  berths?: [number, number];
  /** Feet, matching `filterParsers.length`; `toSearchInput` converts to metres. */
  length?: [number, number];
  /* Which figure `price` bounds. The search reads the boat alone unless told otherwise. */
  pricing?: PriceBasisOption;
};

export function buildSearchHref({ pricing, ...criteria }: SearchCriteria): AppPathname {
  return serializeSearch(serializePricing("/yachts", { pricing: pricing ?? null }), criteria);
}
