"use client";

import { useTranslations } from "next-intl";

/* TODO: placeholder until the "review-and-book" screen arrives. Owns the step body only —
 * the card, the header and Continue belong to `BookingSteps`. */
export default function ReviewAndBookStep() {
  const t = useTranslations("Booking");

  return <p className="p-5 text-base leading-[1.4] text-natural-500">{t("stepPlaceholder")}</p>;
}
