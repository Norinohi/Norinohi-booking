"use client";

import { useTranslations } from "next-intl";

import { MultiSelectField, Section, type SectionProps } from "../fields";
import { useFilterOptions } from "../../hooks/use-filter-options";

export default function WhereSection({ value, set }: SectionProps) {
  const t = useTranslations("Filters");
  const { options } = useFilterOptions();

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
