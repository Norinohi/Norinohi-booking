"use client";

import { useTranslations } from "next-intl";

import { MultiSelectField, Section, type SectionProps } from "../fields";
import { useFilterOptions } from "../../hooks/use-filter-options";
import { facetScopeOf } from "../../lib/state";

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
  const { options } = useFilterOptions(facetScopeOf(value));

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
