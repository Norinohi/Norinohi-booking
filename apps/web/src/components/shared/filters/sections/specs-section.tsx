"use client";

import { useState } from "react";

import { RangeField, Section, type SectionProps, SelectField } from "../fields";
import { LENGTH_UNITS, YEARS_FROM, YEARS_TO } from "../filters-options";
import {
  BATHROOMS_LIMITS,
  BERTHS_LIMITS,
  BOAT_AGE_LIMITS,
  CABINS_LIMITS,
  LENGTH_LIMITS,
  PRICE_LIMITS,
} from "../filters-state";

const FEET_TO_METRES = 0.3048;

export default function SpecsSection({ value, set }: SectionProps) {
  const [lengthUnit, setLengthUnit] = useState("ft");

  const showLength = (feet: number) =>
    lengthUnit === "m" ? String(Math.round(feet * FEET_TO_METRES)) : String(feet);

  return (
    <Section value="specs" title="Boat Specifications">
      <RangeField
        label="Length"
        limits={LENGTH_LIMITS}
        value={value.length}
        onChange={(next) => set("length", next)}
        format={showLength}
        unit={{ value: lengthUnit, options: LENGTH_UNITS, onChange: setLengthUnit }}
      />
      <RangeField
        label="Cabins"
        limits={CABINS_LIMITS}
        value={value.cabins}
        onChange={(next) => set("cabins", next)}
      />
      <RangeField
        label="Berths (sleeping capacity)"
        limits={BERTHS_LIMITS}
        value={value.berths}
        onChange={(next) => set("berths", next)}
      />
      <RangeField
        label="Bathrooms"
        limits={BATHROOMS_LIMITS}
        value={value.bathrooms}
        onChange={(next) => set("bathrooms", next)}
      />
      <RangeField
        label="Price (for selected period)"
        limits={PRICE_LIMITS}
        value={value.price}
        onChange={(next) => set("price", next)}
        format={(n) => `€${n.toLocaleString("en-GB")}`}
      />
      <RangeField
        label="Boat age"
        limits={BOAT_AGE_LIMITS}
        value={value.boatAge}
        onChange={(next) => set("boatAge", next)}
        format={(n) => `${n} ${n === 1 ? "year" : "years"}`}
        showScale={false}
      />

      <SelectField
        label="Year"
        ariaLabel="Built from year"
        options={YEARS_FROM}
        value={value.yearFrom}
        onChange={(next) => set("yearFrom", next)}
      />
      <SelectField
        label="Year"
        ariaLabel="Built to year"
        options={YEARS_TO}
        value={value.yearTo}
        onChange={(next) => set("yearTo", next)}
      />
    </Section>
  );
}
