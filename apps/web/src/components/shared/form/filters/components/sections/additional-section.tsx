"use client";

import { useTranslations } from "next-intl";

import { Section, type SectionProps, ToggleRow } from "../fields";

export default function AdditionalSection({ value, set }: SectionProps) {
  const t = useTranslations("Filters");

  return (
    <Section value="additional" title={t("sections.additional")}>
      <ToggleRow
        control="switch"
        label={t("toggles.withoutAvailabilityConfirmation")}
        checked={value.withoutAvailabilityConfirmation}
        onChange={(next) => set("withoutAvailabilityConfirmation", next)}
      />
      <ToggleRow
        control="switch"
        label={t("toggles.underTemporaryBooking")}
        checked={value.underTemporaryBooking}
        onChange={(next) => set("underTemporaryBooking", next)}
      />
      <ToggleRow
        control="checkbox"
        label={t("toggles.depositInsurance")}
        checked={value.depositInsurance}
        onChange={(next) => set("depositInsurance", next)}
      />
      <ToggleRow
        control="checkbox"
        label={t("toggles.petsAllowed")}
        checked={value.petsAllowed}
        onChange={(next) => set("petsAllowed", next)}
      />
    </Section>
  );
}
