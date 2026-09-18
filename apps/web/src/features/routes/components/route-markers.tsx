"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { Marker } from "react-map-gl/mapbox";

import type { Coordinates } from "@/components/shared/map/geometry";

/*
 * A day of the itinerary: a solid brand dot with its number, the same dot the itinerary in the
 * panel uses. Marinas wear the search map's ring marker, so the two read as different kinds of
 * place where they share a coast: a filled dot is a day, a ring with a count is boats.
 */

const PRESS =
  "cursor-pointer outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-white animate-in fade-in-0 zoom-in-50 fill-mode-backwards duration-300";

export interface DayMarkerProps {
  coordinates: Coordinates;
  /** The day shown in the dot; a round trip's base shows its first. */
  day: number;
  label: string;
  /** "Start", "Finish": the two places a reader cannot work out from the numbers alone. */
  caption?: string;
  delayMs?: number;
  onSelect: () => void;
}

export function DayMarker({
  coordinates,
  day,
  label,
  caption,
  delayMs = 0,
  onSelect,
}: DayMarkerProps) {
  return (
    <Marker longitude={coordinates.lng} latitude={coordinates.lat} anchor="center">
      <button
        type="button"
        aria-label={label}
        onClick={onSelect}
        style={{ animationDelay: `${delayMs}ms` }}
        className={cn(
          PRESS,
          "relative flex size-8 items-center justify-center rounded-full border-2 border-white bg-brand text-sm font-bold text-brand-foreground shadow-brand-glow",
        )}
      >
        {day}
        {caption ? (
          <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full bg-card px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-brand shadow-card">
            {caption}
          </span>
        ) : null}
      </button>
    </Marker>
  );
}
