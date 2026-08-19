"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { RangeField, Section, type SectionProps, SelectField } from "../fields";
import { useFilterOptions } from "../../hooks/use-filter-options";
import { useFilterRanges } from "../../hooks/use-filter-ranges";
import {
  toAgeRange,
  withAgeRange,
  withYearFrom,
  withYearTo,
  type YearBounds,
} from "../../lib/boat-age";

const FEET_TO_METRES = 0.3048;

export default function SpecsSection({ value, set }: SectionProps) {
  const t = useTranslations("Filters");
  const format = useFormatter();
  const { options } = useFilterOptions();
  const { ranges } = useFilterRanges();
  const [lengthUnit, setLengthUnit] = useState("ft");

  const showLength = (feet: number) =>
    lengthUnit === "m" ? String(Math.round(feet * FEET_TO_METRES)) : String(feet);

  /* Two keys, one constraint: the slider and both selects all write through here. */
  function setYears(next: YearBounds) {
    set("yearFrom", next.yearFrom);
    set("yearTo", next.yearTo);
  }

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
      {/*
       * The slider is a view over `yearFrom` / `yearTo` (lib/boat-age.ts): dragging it rewrites the
       * years, picking a year moves it, and a thumb on its end is the same as a select on "Any".
       */}
      <RangeField
        label={t("labels.boatAge")}
        limits={ranges.boatAge}
        value={toAgeRange(value, ranges)}
        onChange={(next) => setYears(withAgeRange(value, next, ranges))}
        format={(n) => t("units.years", { count: n })}
        showScale={false}
      />

      {/*
       * Two bounds, so two labels: both read "Year" and only the aria labels told them apart.
       * The list holds only years a boat was built in, while the slider can land on any year in
       * between; the select then shows that year by itself (Select falls back to the raw value)
       * rather than snapping the thumb, which would leave keyboard users stuck on a gap.
       */}
      <SelectField
        label={t("labels.yearFrom")}
        ariaLabel={t("aria.builtFrom")}
        options={options.years}
        value={value.yearFrom}
        onChange={(next) => setYears(withYearFrom(value, next))}
        clearable
        clearTo="any"
      />
      <SelectField
        label={t("labels.yearTo")}
        ariaLabel={t("aria.builtTo")}
        options={options.years}
        value={value.yearTo}
        onChange={(next) => setYears(withYearTo(value, next))}
        clearable
        clearTo="any"
      />
    </Section>
  );
}
