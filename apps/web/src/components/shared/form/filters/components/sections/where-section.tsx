"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { MultiSelectField, Section, type SectionProps } from "../fields";
import { useFilterOptions } from "../../hooks/use-filter-options";
import { facetScopeOf } from "../../lib/state";

/** Each control that a country narrows, against the list it must stay inside. */
const DEPENDENT_KEYS = ["sailingArea", "charterCompany", "marina"] as const;

/**
 * The four place controls, each offering only what the others leave standing: pick Croatia and
 * Sailing Area drops to Croatian regions, Marina to Croatian marinas.
 *
 * The narrowing is the server's — `charterSearch.facets` skips a group's own key and applies the
 * rest — so one scoped read answers all four, and Country keeps its full list while the three
 * below it shrink. It follows the draft rather than the applied filters, because the list has to
 * be right while the panel is still being filled in, not after Apply.
 */
export default function WhereSection({ value, set }: SectionProps) {
  const t = useTranslations("Filters");
  const { options, isSuccess, isPlaceholderData } = useFilterOptions(facetScopeOf(value));

  /*
   * A selection the narrowed list no longer offers is dropped.
   *
   * Switching from Greece to Croatia leaves a Cyclades region behind that Croatia does not
   * contain: the control stops offering it, the chip still names it, and the search it describes
   * matches nothing. Which regions belong to which country is only known here through the list
   * the server just returned, so the prune waits for it rather than clearing on every country
   * tick — adding a second country to the one already picked must keep the regions of the first.
   *
   * `isPlaceholderData` is the guard that matters: `keepPreviousData` holds the outgoing list
   * across a scope change, and pruning against it would delete a selection using the answer to
   * the previous question. Only removals happen here, so each pass widens what the next one is
   * measured against and it settles after one.
   *
   * `city` is deliberately absent. It has no control of its own and arrives locked from a catalog
   * page's path, so pruning it would erase the page's own facet.
   */
  useEffect(() => {
    if (!isSuccess || isPlaceholderData) return;

    const offered = {
      sailingArea: options.sailingAreas.map((option) => option.value),
      charterCompany: options.charterCompanies.map((option) => option.value),
      marina: options.marinas.map((option) => option.value),
    };

    for (const key of DEPENDENT_KEYS) {
      const survives = new Set(offered[key]);
      const kept = value[key].filter((selected) => survives.has(selected));
      if (kept.length !== value[key].length) set(key, kept);
    }
  }, [isSuccess, isPlaceholderData, options, value, set]);

  return (
    <Section value="where" title={t("sections.where")}>
      <MultiSelectField
        label={t("labels.country")}
        options={options.countries}
        value={value.country}
        onChange={(next) => set("country", next)}
        placeholder={t("placeholders.allCountries")}
        searchPlaceholder={t("placeholders.searchCountries")}
      />
      <MultiSelectField
        label={t("labels.sailingArea")}
        options={options.sailingAreas}
        value={value.sailingArea}
        onChange={(next) => set("sailingArea", next)}
        placeholder={t("placeholders.allRegions")}
      />
      <MultiSelectField
        label={t("labels.charterCompany")}
        options={options.charterCompanies}
        value={value.charterCompany}
        onChange={(next) => set("charterCompany", next)}
        placeholder={t("placeholders.allCompanies")}
      />
      <MultiSelectField
        label={t("labels.marina")}
        options={options.marinas}
        value={value.marina}
        onChange={(next) => set("marina", next)}
        placeholder={t("placeholders.allMarinas")}
        searchPlaceholder={t("placeholders.searchMarinas")}
      />
    </Section>
  );
}
