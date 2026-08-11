"use client";

import type { AppPathname } from "@/i18n/navigation";

import { serializeSearch } from "./search-params";

export type SearchCriteria = {
  country?: string[];
  sailingArea?: string[];
  boatType?: string[];
  crew?: string[];
  startDate?: string | null;
  duration?: string;
  price?: [number, number];
  berths?: [number, number];
};

export function buildSearchHref(criteria: SearchCriteria): AppPathname {
  return serializeSearch("/yachts", criteria);
}
