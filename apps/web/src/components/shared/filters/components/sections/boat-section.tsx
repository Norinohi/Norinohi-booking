"use client";

import { MultiSelectField, Section, type SectionProps } from "../fields";
import { BOAT_TYPES, CREWS, EQUIPMENT, MAINSAIL_TYPES, MODELS } from "../../lib/options";

export default function BoatSection({ value, set }: SectionProps) {
  return (
    <Section value="boat" title="Boat & Crew">
      <MultiSelectField
        label="Boat type"
        options={BOAT_TYPES}
        value={value.boatType}
        onChange={(next) => set("boatType", next)}
        placeholder="All boats"
      />
      <MultiSelectField
        label="Model"
        options={MODELS}
        value={value.model}
        onChange={(next) => set("model", next)}
        placeholder="All models"
        searchPlaceholder="Search Models..."
      />
      <MultiSelectField
        label="Crew"
        options={CREWS}
        value={value.crew}
        onChange={(next) => set("crew", next)}
        placeholder="Any crew"
      />
      <MultiSelectField
        label="Mainsail type"
        options={MAINSAIL_TYPES}
        value={value.mainsailType}
        onChange={(next) => set("mainsailType", next)}
        placeholder="All types"
      />
      <MultiSelectField
        label="Equipment"
        options={EQUIPMENT}
        value={value.equipment}
        onChange={(next) => set("equipment", next)}
        placeholder="Any equipment"
      />
    </Section>
  );
}
