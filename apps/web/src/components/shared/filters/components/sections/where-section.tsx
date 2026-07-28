"use client";

import { MultiSelectField, Section, type SectionProps } from "../fields";
import { CHARTER_COMPANIES, COUNTRIES, MARINAS, SAILING_AREAS } from "../../lib/options";

export default function WhereSection({ value, set }: SectionProps) {
  return (
    <Section value="where" title="Where to?">
      <MultiSelectField
        label="Country"
        options={COUNTRIES}
        value={value.country}
        onChange={(next) => set("country", next)}
        placeholder="All countries"
        searchPlaceholder="Search Countries..."
      />
      <MultiSelectField
        label="Sailing Area"
        options={SAILING_AREAS}
        value={value.sailingArea}
        onChange={(next) => set("sailingArea", next)}
        placeholder="All regions"
      />
      <MultiSelectField
        label="Charter Company"
        options={CHARTER_COMPANIES}
        value={value.charterCompany}
        onChange={(next) => set("charterCompany", next)}
        placeholder="All companies"
      />
      <MultiSelectField
        label="Marina"
        options={MARINAS}
        value={value.marina}
        onChange={(next) => set("marina", next)}
        placeholder="All marinas"
        searchPlaceholder="Search Marinas..."
      />
    </Section>
  );
}
