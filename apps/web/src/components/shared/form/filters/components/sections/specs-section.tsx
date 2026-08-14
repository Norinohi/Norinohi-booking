"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { RangeField, Section, type SectionProps, SelectField } from "../fields";
import { useFilterOptions } from "../../hooks/use-filter-options";
import { useFilterRanges } from "../../hooks/use-filter-ranges";

const FEET_TO_METRES = 0.3048;

export default function SpecsSection({ value, set }: SectionProps) {
  const t = useTranslations("Filters");
  const format = useFormatter();
  const { options } = useFilterOptions();
  const { ranges } = useFilterRanges();
  const [lengthUnit, setLengthUnit] = useState("ft");

  const showLength = (feet: number) =>
    lengthUnit === "m" ? String(Math.round(feet * FEET_TO_METRES)) : String(feet);

  return (
    <Section value="specs" title={t("sections.specs")}>
      <RangeField
        label={t("labels.length")}
        limits={ranges.length}
        value={value.length}
        onChange={(next) => set("length", next)}
        format={showLength}
        unit={{ value: lengthUnit, options: options.lengthUnits, onChange: setLengthUnit }}
      />
      <RangeField
        label={t("labels.cabins")}
        limits={ranges.cabins}
        value={value.cabins}
        onChange={(next) => set("cabins", next)}
      />
      <RangeField
        label={t("labels.berths")}
        limits={ranges.berths}
        value={value.berths}
        onChange={(next) => set("berths", next)}
      />
      <RangeField
        label={t("labels.bathrooms")}
        limits={ranges.bathrooms}
        value={value.bathrooms}
        onChange={(next) => set("bathrooms", next)}
      />
      <RangeField
        label={t("labels.price")}
        limits={ranges.price}
        value={value.price}
        onChange={(next) => set("price", next)}
        format={(n) => format.number(n, "eur")}
      />
      <RangeField
        label={t("labels.boatAge")}
        limits={ranges.boatAge}
        value={value.boatAge}
        onChange={(next) => set("boatAge", next)}
        format={(n) => t("units.years", { count: n })}
        showScale={false}
      />

      {/* Two bounds, so two labels: both read "Year" and only the aria labels told them apart. */}
      <SelectField
        label={t("labels.yearFrom")}
        ariaLabel={t("aria.builtFrom")}
        options={options.years}
        value={value.yearFrom}
        onChange={(next) => set("yearFrom", next)}
        clearable
        clearTo="any"
      />
      <SelectField
        label={t("labels.yearTo")}
        ariaLabel={t("aria.builtTo")}
        options={options.years}
        value={value.yearTo}
        onChange={(next) => set("yearTo", next)}
        clearable
        clearTo="any"
      />
    </Section>
  );
}
