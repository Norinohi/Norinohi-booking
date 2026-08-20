"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { MapPin } from "lucide-react";
import { Marker } from "react-map-gl/mapbox";

import type { Coordinates } from "@/components/shared/overlay/marina-popover";

const STAGGER_MS = 50;

export type MapMarkerProps = {
  coordinates: Coordinates;
  label: string;
  selected?: boolean;
  /** Position in the set, which becomes the stagger. Ignored when `delayMs` is given. */
  order?: number;
  /** An exact delay instead, for a route, where a marker waits for the line to reach it. */
  delayMs?: number;
  onSelect: () => void;
  /**
   * A word plate under the marker — "Start", "Finish" — for the two places on an itinerary that
   * a reader cannot work out from the map alone.
   *
   * Deliberately words and deliberately not a corner badge: that corner, on the search map, holds
   * `MapClusterMarker`'s count, so a number there reads as *how many are here* rather than *which
   * one this is*. The search map passes nothing and keeps a bare marker.
   */
  caption?: string;
};

export default function MapMarker({
  coordinates,
  label,
  selected,
  order = 0,
  delayMs,
  onSelect,
  caption,
}: MapMarkerProps) {
  return (
    <Marker longitude={coordinates.lng} latitude={coordinates.lat} anchor="center">
      <button
        type="button"
        aria-label={label}
        onPointerDown={onSelect}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onSelect();
        }}
        style={{ animationDelay: `${delayMs ?? order * STAGGER_MS}ms` }}
        className={cn(
          /* Smaller on a phone: seven of these at 84px merge into one blur on a 343px map. */
          "relative flex size-12 cursor-pointer items-center justify-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white md:size-21",
          "duration-300 animate-in fade-in-0 zoom-in-50 fill-mode-backwards",
          selected ? "border-brand bg-brand/40" : "border-white/50 bg-white/25",
        )}
      >
        <MapPin className="size-6 fill-brand text-white" />
        {caption ? (
          <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-brand-foreground shadow-[4px_4px_15px_rgba(47,128,237,0.15)] md:text-xs">
            {caption}
          </span>
        ) : null}
      </button>
    </Marker>
  );
}
