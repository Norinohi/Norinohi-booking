"use client";

import { useTranslations } from "next-intl";

/* TODO: placeholder until the "extras" screen arrives. Owns the step body only —
 * the card, the header and Continue belong to `BookingSteps`. */
export default function ExtrasStep() {
  const t = useTranslations("Booking");

  return <p className="text-base leading-[1.4] text-natural-500">{t("stepPlaceholder")}</p>;
}
