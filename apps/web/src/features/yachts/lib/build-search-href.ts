"use client";

import type { Route } from "next";
import { createSerializer } from "nuqs";

import { filterParsers } from "./search-params";

const serialize = createSerializer(filterParsers);

export type SearchCriteria = {
  country?: string[];
  boatType?: string[];
  crew?: string[];
  startDate?: string | null;
  duration?: string;
  price?: [number, number];
  berths?: [number, number];
};

export function buildSearchHref(criteria: SearchCriteria): Route {
  return serialize("/yachts", criteria) as Route;
}
