"use client";

import { Star } from "lucide-react";

import { RangeField, Section, type SectionProps } from "../fields";
import { RATING_LIMITS } from "../../lib/state";

export default function RatingsSection({ value, set }: SectionProps) {
  return (
    <Section value="ratings" title="Ratings">
      <RangeField
        label="Guest Rating"
        limits={RATING_LIMITS}
        value={value.guestRating}
        onChange={(next) => set("guestRating", next)}
        icon={<Star className="size-3 shrink-0 text-gold" />}
      />
    </Section>
  );
}
