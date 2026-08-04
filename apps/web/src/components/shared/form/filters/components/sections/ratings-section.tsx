"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { RangeField, Section, type SectionProps } from "../fields";
import { RATING_LIMITS } from "../../lib/state";

export default function RatingsSection({ value, set }: SectionProps) {
  const t = useTranslations("Filters");

  return (
    <Section value="ratings" title={t("sections.ratings")}>
      <RangeField
        label={t("labels.guestRating")}
        limits={RATING_LIMITS}
        value={value.guestRating}
        onChange={(next) => set("guestRating", next)}
        icon={<Star className="size-3 shrink-0 text-gold" />}
      />
    </Section>
  );
}
