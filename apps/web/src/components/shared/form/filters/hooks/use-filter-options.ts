"use client";

import { useTranslations } from "next-intl";

import { crewLabel } from "@/lib/crew-label";

import type { Option } from "../lib/options";
import type { FacetScope } from "../lib/state";
import { useFacets } from "./use-facets";

export type FilterOptions = {
  countries: Option[];
  sailingAreas: Option[];
  charterCompanies: Option[];
  marinas: Option[];
  durations: Option[];
  dateFlexibility: Option[];
  boatTypes: Option[];
  models: Option[];
  crews: Option[];
  mainsailTypes: Option[];
  equipment: Option[];
  lengthUnits: Option[];
  years: Option[];
};

/*
 * The shape a filter-driven control renders before facets arrive. Exported so a Suspense
 * fallback can render the SAME component in its empty state rather than a hand-built skeleton
 * that would drift as the control changes.
 */
export const EMPTY_OPTIONS: FilterOptions = {
  countries: [],
  sailingAreas: [],
  charterCompanies: [],
  marinas: [],
  durations: [],
  dateFlexibility: [],
  boatTypes: [],
  models: [],
  crews: [],
  mainsailTypes: [],
  equipment: [],
  lengthUnits: [],
  years: [],
};

const DATE_FLEXIBILITY_KEY = new Map<
  string,
  "on-day" | "1-3-days" | "1-week" | "2-weeks" | "1-month"
>([
  ["on-day", "on-day"],
  ["1-3-days", "1-3-days"],
  ["1-week", "1-week"],
  ["2-weeks", "2-weeks"],
  ["1-month", "1-month"],
]);

/** `scope` narrows the lists to a place; see `facetScopeOf`. Omitted, every option is offered. */
export function useFilterOptions(scope?: FacetScope) {
  const query = useFacets(scope);
  const t = useTranslations("Filters.options");
  const tCrew = useTranslations("Common.crewTypes");
  const options = query.data?.options ?? EMPTY_OPTIONS;

  /*
   * Four lists the facets read cannot localize, translated here rather than one control at a
   * time. `durations`, `dateFlexibility` and the "any year" entry are fixed choices the read
   * model spells in English because it has no locale; `crews` is a provider code that stays a
   * code until a facet_media translation exists for it, which is what `crewLabel` recognises.
   *
   * Keyed on `value`, never on the label, because the value is what the filter state holds.
   * A value with no message keeps the English label rather than disappearing from the list.
   */
  const localized: FilterOptions = {
    ...options,
    durations: options.durations.map((option) => {
      const days = Number(option.value);
      return Number.isFinite(days) ? { ...option, label: t("duration", { days }) } : option;
    }),
    dateFlexibility: options.dateFlexibility.map((option) => {
      const key = DATE_FLEXIBILITY_KEY.get(option.value);
      return key ? { ...option, label: t(`dateFlexibility.${key}`) } : option;
    }),
    crews: options.crews.map((option) => ({
      ...option,
      label: crewLabel(tCrew, option.label),
    })),
    years: options.years.map((option) =>
      option.value === "any" ? { ...option, label: t("anyYear") } : option,
    ),
  };

  return { ...query, options: localized };
}
