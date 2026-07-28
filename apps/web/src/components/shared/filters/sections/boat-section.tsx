"use client";

import { Section, type SectionProps, SelectField } from "../fields";
import { BOAT_TYPES, CREWS, EQUIPMENT, MAINSAIL_TYPES, MODELS } from "../filters-options";

export default function BoatSection({ value, set }: SectionProps) {
  return (
    <Section value="boat" title="Boat & Crew">
      <SelectField
        label="Boat type"
        options={BOAT_TYPES}
        value={value.boatType}
        onChange={(next) => set("boatType", next)}
      />
      <SelectField
        label="Model"
        options={MODELS}
        value={value.model}
        onChange={(next) => set("model", next)}
      />
      <SelectField
        label="Crew"
        options={CREWS}
        value={value.crew}
        onChange={(next) => set("crew", next)}
      />
      <SelectField
        label="Mainsail type"
        options={MAINSAIL_TYPES}
        value={value.mainsailType}
        onChange={(next) => set("mainsailType", next)}
      />
      <SelectField
        label="Equipment"
        options={EQUIPMENT}
        value={value.equipment}
        onChange={(next) => set("equipment", next)}
      />
    </Section>
  );
}
