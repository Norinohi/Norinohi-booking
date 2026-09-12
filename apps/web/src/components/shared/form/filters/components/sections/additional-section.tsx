"use client";

import { useTranslations } from "next-intl";

import { Section, type SectionProps, ToggleRow } from "../fields";

export default function AdditionalSection({ value, set }: SectionProps) {
  const t = useTranslations("Filters");
  /*
   * The hold filter widens a dated search, so with no dates there is nothing for it to widen: it
   * would either change nothing or, read as a narrowing filter, hide most of the catalogue over a
   * week nobody asked about. Disabled and explained rather than hidden, so the control does not
   * appear and disappear as the visitor edits the dates above it.
   */
  const datesChosen = value.startDate !== null;

  return (
    <Section value="additional" title={t("sections.additional")}>
      <ToggleRow
        control="switch"
        label={t("toggles.underTemporaryBooking")}
        hint={datesChosen ? t("hints.underTemporaryBooking") : t("hints.needsDates")}
        disabled={!datesChosen}
        checked={datesChosen && value.underTemporaryBooking}
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
      <ToggleRow
        control="checkbox"
        label={t("toggles.bestValue")}
        checked={value.bestValue}
        onChange={(next) => set("bestValue", next)}
      />
    </Section>
  );
}
