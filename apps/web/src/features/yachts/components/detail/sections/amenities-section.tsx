"use client";

import { CircleCheckBig } from "lucide-react";
import { useTranslations } from "next-intl";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

export default function AmenitiesSection() {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();

  if (!data) return null;

  return (
    <DetailSection id="amenities" title={t("sections.amenities")}>
      <div className="grid gap-x-10 gap-y-3 md:grid-cols-2 md:gap-y-0">
        {data.includedAmenities.map((amenity) => (
          <div
            key={amenity.code}
            className="flex items-center gap-2 border-b border-dashed border-border pt-2 pb-1.75 md:pt-3 md:pb-2.75"
          >
            <span className="min-w-0 flex-1 text-base text-foreground">{amenity.label}</span>
            <div className="flex shrink-0 items-center gap-2 py-1">
              <CircleCheckBig className="size-5 shrink-0 text-brand" />
              <span className="text-sm font-semibold tracking-wide text-foreground">
                {t("included")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
