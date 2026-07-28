"use client";

import { Section, type SectionProps, ToggleRow } from "../fields";

export default function AdditionalSection({ value, set }: SectionProps) {
  return (
    <Section value="additional" title="Additional Filters">
      <ToggleRow
        control="switch"
        label="Show yachts without availability confirmation"
        checked={value.withoutAvailabilityConfirmation}
        onChange={(next) => set("withoutAvailabilityConfirmation", next)}
      />
      <ToggleRow
        control="switch"
        label="Show yachts under temporary booking"
        checked={value.underTemporaryBooking}
        onChange={(next) => set("underTemporaryBooking", next)}
      />
      <ToggleRow
        control="checkbox"
        label="Security deposit insurance included"
        checked={value.depositInsurance}
        onChange={(next) => set("depositInsurance", next)}
      />
      <ToggleRow
        control="checkbox"
        label="Pets allowed"
        checked={value.petsAllowed}
        onChange={(next) => set("petsAllowed", next)}
      />
    </Section>
  );
}
