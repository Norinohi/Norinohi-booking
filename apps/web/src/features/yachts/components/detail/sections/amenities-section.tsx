"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ChevronDown, CircleCheckBig } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

/*
 * Six rows collapsed, whatever the column count is. The grid is one column on phones and two
 * from `md`, so the same six rows are six items on one and twelve on the other: the extra six
 * are rendered either way and hidden by a class, because deciding the count from the viewport
 * in JavaScript would have the server render one number and the client another.
 */
const COLLAPSED_ROWS = 6;
const COLLAPSED_ON_DESKTOP = COLLAPSED_ROWS * 2;

export default function AmenitiesSection() {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();
  const [expanded, setExpanded] = useState(false);

  if (!data) return null;

  const amenities = data.includedAmenities;
  /* The read model already ordered these so the curated ones survive the fold. */
  const shown = expanded ? amenities : amenities.slice(0, COLLAPSED_ON_DESKTOP);
  /*
   * Two columns fit twice as much, so a list of nine is already whole on a desktop and folded on
   * a phone. The button follows: always there when even the wide grid has to hide something,
   * phone-only when it does not, gone when six rows hold everything.
   */
  const foldable = amenities.length > COLLAPSED_ROWS;
  const foldableOnDesktop = amenities.length > COLLAPSED_ON_DESKTOP;

  return (
    <DetailSection id="amenities" title={t("sections.amenities")}>
      <div className="grid gap-x-10 gap-y-3 md:grid-cols-2 md:gap-y-0">
        {shown.map((amenity, index) => (
          <div
            key={amenity.code}
            className={
              expanded || index < COLLAPSED_ROWS
                ? "flex items-center gap-2 border-b border-dashed border-border pt-2 pb-1.75 md:pt-3 md:pb-2.75"
                : "hidden items-center gap-2 border-b border-dashed border-border md:flex md:pt-3 md:pb-2.75"
            }
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
      {foldable && (
        <Button
          variant="ghost"
          className={cn(
            "mt-3 h-auto gap-1 px-0 text-base font-semibold text-brand hover:bg-transparent",
            !foldableOnDesktop && "md:hidden",
          )}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded
            ? t("amenities.showFewer")
            : t("amenities.showAll", { count: amenities.length })}
          <ChevronDown className={expanded ? "size-4 rotate-180" : "size-4"} />
        </Button>
      )}
    </DetailSection>
  );
}
