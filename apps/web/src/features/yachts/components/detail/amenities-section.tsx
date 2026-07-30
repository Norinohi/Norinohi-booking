import { CircleCheckBig } from "lucide-react";
import { useTranslations } from "next-intl";

import DetailSection from "./detail-section";

const AMENITIES = [
  ["Air conditioning", "Free Wi-Fi"],
  ["Fully equipped kitchen", "Bluetooth sound system"],
  ["Sun deck with loungers", "Swim platform"],
  ["Outdoor dining area", "Fresh water system"],
] as const;

export default function AmenitiesSection() {
  const t = useTranslations("YachtDetail");

  return (
    <DetailSection id="amenities" title={t("sections.amenities")}>
      <div className="flex flex-col">
        {AMENITIES.map((row) => (
          <div
            key={row[0]}
            className="flex items-start gap-10 border-b border-dashed border-border"
          >
            {row.map((amenity) => (
              <div key={amenity} className="flex min-w-0 flex-1 items-center gap-2 pt-3 pb-2.75">
                <span className="min-w-0 flex-1 text-base text-foreground">{amenity}</span>
                <div className="flex shrink-0 items-center gap-2 py-1">
                  <CircleCheckBig className="size-5 shrink-0 text-brand" />
                  <span className="text-sm font-semibold tracking-wide text-foreground">
                    {t("included")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
