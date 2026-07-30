"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { RangeField, Section, type SectionProps, SelectField } from "../fields";
import { useFilterOptions } from "../../hooks/use-filter-options";
import {
  BATHROOMS_LIMITS,
  BERTHS_LIMITS,
  BOAT_AGE_LIMITS,
  CABINS_LIMITS,
  LENGTH_LIMITS,
  PRICE_LIMITS,
} from "../../lib/state";

const FEET_TO_METRES = 0.3048;

export default function SpecsSection({ value, set }: SectionProps) {
  const t = useTranslations("Filters");
  const format = useFormatter();
  const options = useFilterOptions();
  const [lengthUnit, setLengthUnit] = useState("ft");

  const showLength = (feet: number) =>
    lengthUnit === "m" ? String(Math.round(feet * FEET_TO_METRES)) : String(feet);

  return (
    <Section value="specs" title={t("sections.specs")}>
      <RangeField
        label={t("labels.length")}
        limits={LENGTH_LIMITS}
        value={value.length}
        onChange={(next) => set("length", next)}
        format={showLength}
        unit={{ value: lengthUnit, options: options.lengthUnits, onChange: setLengthUnit }}
      />
      <RangeField
        label={t("labels.cabins")}
        limits={CABINS_LIMITS}
        value={value.cabins}
        onChange={(next) => set("cabins", next)}
      />
      <RangeField
        label={t("labels.berths")}
        limits={BERTHS_LIMITS}
        value={value.berths}
        onChange={(next) => set("berths", next)}
      />
      <RangeField
        label={t("labels.bathrooms")}
        limits={BATHROOMS_LIMITS}
        value={value.bathrooms}
        onChange={(next) => set("bathrooms", next)}
      />
      <RangeField
        label={t("labels.price")}
        limits={PRICE_LIMITS}
        value={value.price}
        onChange={(next) => set("price", next)}
        format={(n) => format.number(n, "eur")}
      />
      <RangeField
        label={t("labels.boatAge")}
        limits={BOAT_AGE_LIMITS}
        value={value.boatAge}
        onChange={(next) => set("boatAge", next)}
        format={(n) => t("units.years", { count: n })}
        showScale={false}
      />

      <SelectField
        label={t("labels.year")}
        ariaLabel={t("aria.builtFrom")}
        options={options.years}
        value={value.yearFrom}
        onChange={(next) => set("yearFrom", next)}
        clearable
        clearTo="any"
      />
      <SelectField
        label={t("labels.year")}
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
