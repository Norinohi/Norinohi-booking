"use client";

import { useFormatter, useTranslations } from "next-intl";

import { dayToDisplay } from "@/lib/date";

import { type ChipId, CHIP_DEFS, type FilterChip, isFilterKeyActive } from "../lib/chips";
import { labelOf, type Option } from "../lib/options";
import type { FiltersState, Range } from "../lib/state";
import { useFilterOptions } from "./use-filter-options";
import { useFilterRanges } from "./use-filter-ranges";

const SHOWN_LABELS = 2;

export function useFilterChips(state: FiltersState): FilterChip[] {
  const t = useTranslations("Filters.chips");
  const format = useFormatter();
  const options = useFilterOptions();
  const { defaults } = useFilterRanges();

  /** Two names then a counter, so a chip stays readable when many boxes are ticked. */
  function names(from: Option[], values: string[]): string {
    const labels = values.map((value) => labelOf(from, value));
    if (labels.length <= SHOWN_LABELS) return labels.join(", ");
    return t("more", {
      names: labels.slice(0, SHOWN_LABELS).join(", "),
      count: labels.length - SHOWN_LABELS,
    });
  }

  const range = ([from, to]: Range) => `${format.number(from)}–${format.number(to)}`;
  const money = ([from, to]: Range) => `${format.number(from, "eur")}–${format.number(to, "eur")}`;

  function label(id: ChipId): string {
    switch (id) {
      case "country":
        return t("country", { value: names(options.countries, state.country) });
      case "sailingArea":
        return t("sailingArea", { value: names(options.sailingAreas, state.sailingArea) });
      case "charterCompany":
        return t("charterCompany", {
          value: names(options.charterCompanies, state.charterCompany),
        });
      case "marina":
        return t("marina", { value: names(options.marinas, state.marina) });
      case "startDate":
        return t("startDate", {
          value: state.startDate
            ? format.dateTime(dayToDisplay(state.startDate), "day")
            : t("none"),
        });
      case "duration":
        return t("duration", { count: Number(state.duration) });
      case "dateFlexibility":
        return t("dateFlexibility", {
          value: labelOf(options.dateFlexibility, state.dateFlexibility),
        });
      case "boatType":
        return t("boatType", { value: names(options.boatTypes, state.boatType) });
      case "model":
        return t("model", { value: names(options.models, state.model) });
      case "crew":
        return t("crew", { value: names(options.crews, state.crew) });
      case "mainsailType":
        return t("mainsailType", { value: names(options.mainsailTypes, state.mainsailType) });
      case "equipment":
        return t("equipment", { value: names(options.equipment, state.equipment) });
      case "length":
        return t("length", { value: range(state.length) });
      case "cabins":
        return t("cabins", { value: range(state.cabins) });
      case "berths":
        return t("berths", { value: range(state.berths) });
      case "bathrooms":
        return t("bathrooms", { value: range(state.bathrooms) });
      case "price":
        return t("price", { value: money(state.price) });
      case "boatAge":
        return t("boatAge", { value: range(state.boatAge) });
      case "year":
        return t("year", {
          from: state.yearFrom === "any" ? t("any") : state.yearFrom,
          to: state.yearTo === "any" ? t("any") : state.yearTo,
        });
      case "withoutAvailabilityConfirmation":
        return t("withoutAvailabilityConfirmation");
      case "underTemporaryBooking":
        return t("underTemporaryBooking");
      case "depositInsurance":
        return t("depositInsurance");
      case "petsAllowed":
        return t("petsAllowed");
      case "guestRating":
        return t("guestRating", { value: range(state.guestRating) });
    }
  }

  return CHIP_DEFS.filter((def) =>
    def.keys.some((key) => isFilterKeyActive(state, key, defaults)),
  ).map((def) => ({ id: def.id, label: label(def.id), keys: [...def.keys] }));
}
