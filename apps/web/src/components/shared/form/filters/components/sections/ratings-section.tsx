"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";

import { RangeField, Section, type SectionProps } from "../fields";
import { useFilterRanges } from "../../hooks/use-filter-ranges";

export default function RatingsSection({ value, set }: SectionProps) {
  const t = useTranslations("Filters");
  const { ranges } = useFilterRanges();

  return (
    <Section value="ratings" title={t("sections.ratings")}>
      <RangeField
        label={t("labels.guestRating")}
        limits={ranges.guestRating}
        value={value.guestRating}
        onChange={(next) => set("guestRating", next)}
        icon={<Star className="size-3 shrink-0 text-gold" />}
      />
    </Section>
  );
}
