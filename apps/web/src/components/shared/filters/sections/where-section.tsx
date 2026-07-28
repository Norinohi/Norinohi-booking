"use client";

import { Section, type SectionProps, SelectField } from "../fields";
import { CHARTER_COMPANIES, COUNTRIES, MARINAS, SAILING_AREAS } from "../filters-options";

export default function WhereSection({ value, set }: SectionProps) {
  return (
    <Section value="where" title="Where to?">
      <SelectField
        label="Country"
        options={COUNTRIES}
        value={value.country}
        onChange={(next) => set("country", next)}
      />
      <SelectField
        label="Sailing Area"
        options={SAILING_AREAS}
        value={value.sailingArea}
        onChange={(next) => set("sailingArea", next)}
      />
      <SelectField
        label="Charter Company"
        options={CHARTER_COMPANIES}
        value={value.charterCompany}
        onChange={(next) => set("charterCompany", next)}
      />
      <SelectField
        label="Marina"
        options={MARINAS}
        value={value.marina}
        onChange={(next) => set("marina", next)}
      />
    </Section>
  );
}
