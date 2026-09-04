"use client";

import { useTranslations } from "next-intl";

import { MultiSelectField, Section, type SectionProps } from "../fields";
import { useFilterOptions } from "../../hooks/use-filter-options";

export default function BoatSection({ value, set }: SectionProps) {
  const t = useTranslations("Filters");
  const { options } = useFilterOptions();

  return (
    <Section value="boat" title={t("sections.boat")}>
      <MultiSelectField
        label={t("labels.boatType")}
        options={options.boatTypes}
        value={value.boatType}
        onChange={(next) => set("boatType", next)}
        placeholder={t("placeholders.allBoats")}
      />
      <MultiSelectField
        label={t("labels.model")}
        options={options.models}
        value={value.model}
        onChange={(next) => set("model", next)}
        placeholder={t("placeholders.allModels")}
        searchPlaceholder={t("placeholders.searchModels")}
      />
      <MultiSelectField
        label={t("labels.crew")}
        options={options.crews}
        value={value.crew}
        onChange={(next) => set("crew", next)}
        placeholder={t("placeholders.anyCrew")}
      />
      <MultiSelectField
        label={t("labels.mainsailType")}
        options={options.mainsailTypes}
        value={value.mainsailType}
        onChange={(next) => set("mainsailType", next)}
        placeholder={t("placeholders.allTypes")}
      />
      <MultiSelectField
        label={t("labels.equipment")}
        options={options.equipment}
        value={value.equipment}
        onChange={(next) => set("equipment", next)}
        placeholder={t("placeholders.anyEquipment")}
        searchPlaceholder={t("placeholders.searchEquipment")}
      />
    </Section>
  );
}
