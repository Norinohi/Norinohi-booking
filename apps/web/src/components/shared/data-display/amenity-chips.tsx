"use client";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@yacht-charter/ui/components/overlay/popover";
import { useTranslations } from "next-intl";

import type { BoatCardAmenity } from "./boat-card";

/* One amenity, icon and name. Shared by the row and the overflow list so the two cannot drift. */
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
 * The curated amenities that did not fit, behind a "+N" button.
 *
 * A popover rather than a tooltip, though the content looks like one. A tooltip opens on hover,
 * and these sit in a grid of cards a pointer crosses on its way anywhere -- the list would keep
 * flicking open at boats nobody asked about. A popover opens on click, closes on Escape and on
 * an outside click, and moves focus, which is also the only version of this a keyboard or a
 * phone can use.
 *
 * The list scrolls because the curated set runs to eighteen and a well-equipped boat carries
 * most of it; `max-h` is what stops the popup growing past the card it belongs to.
 */
export function AmenityOverflow({ amenities }: { amenities: BoatCardAmenity[] }) {
  const t = useTranslations("Common.boatCard");

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            /* The whole card is a link, so without this the trigger's click navigates instead. */
            onClick={(event) => event.preventDefault()}
            aria-label={t("moreAmenities", { count: amenities.length })}
            className="flex h-8 cursor-pointer items-center rounded-lg border border-natural-100 bg-card px-2.5 text-xs leading-[1.3] font-semibold text-brand transition-colors outline-none hover:border-brand hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:border-brand data-popup-open:bg-brand-50"
          />
        }
      >
        {t("moreAmenitiesShort", { count: amenities.length })}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3">
        <div className="flex max-h-56 flex-col gap-2 overflow-y-auto overscroll-contain">
          {amenities.map((amenity) => (
            <AmenityChip key={amenity.label} amenity={amenity} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
