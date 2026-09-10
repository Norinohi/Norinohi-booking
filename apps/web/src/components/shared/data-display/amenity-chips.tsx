"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@yacht-charter/ui/components/overlay/tooltip";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { BoatCardAmenity } from "./boat-card";

/* One amenity, icon and name. Shared by the row and the overflow tooltip so the two cannot drift. */
export function AmenityChip({ amenity }: { amenity: BoatCardAmenity }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand *:size-4">
        {amenity.icon}
      </span>
      <span className="text-xs leading-[1.3] font-semibold text-foreground">{amenity.label}</span>
    </div>
  );
}

/**
 * The curated amenities that did not fit, behind a "+N".
 *
 * A button rather than a hover-only affordance: base-ui opens a tooltip on focus and on touch
 * from a focusable trigger, so this reaches a keyboard and a phone. The list scrolls because the
 * curated set runs to eighteen and a boat can carry most of it, and `max-h` is what stops the
 * popup growing past the card it belongs to.
 */
export function AmenityOverflow({ amenities }: { amenities: BoatCardAmenity[] }) {
  const t = useTranslations("Common.boatCard");
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        render={
          <button
            type="button"
            /* Controlled and opened on click, matching CardNote: the card is a link, so hover
               alone would leave this unreachable on a phone, and the click must not navigate. */
            onClick={(event) => {
              event.preventDefault();
              setOpen(true);
            }}
            aria-label={t("moreAmenities", { count: amenities.length })}
            className="cursor-pointer rounded-lg px-2 py-1 text-xs leading-[1.3] font-semibold text-brand outline-none hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        }
      >
        {t("moreAmenitiesShort", { count: amenities.length })}
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        <div className="flex max-h-56 flex-col gap-2 overflow-y-auto overscroll-contain">
          {amenities.map((amenity) => (
            <AmenityChip key={amenity.label} amenity={amenity} />
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
