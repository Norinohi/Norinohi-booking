"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { Ship } from "lucide-react";
import { Marker } from "react-map-gl/mapbox";

import type { Coordinates } from "@/components/shared/map/geometry";

/*
 * The routes map puts two kinds of place on one coast, and the shared ring marker drew both the
 * same: a day of the itinerary and a marina with boats read as one blur of circles at the start.
 * So they get two shapes. A day is a solid brand dot with its number, the same dot the itinerary
 * in the panel uses; a marina is a white pill with a boat and its count, so a number beside a boat
 * is plainly how many boats, never which day.
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

export interface MarinaMarkerProps {
  coordinates: Coordinates;
  count: number;
  label: string;
  selected?: boolean;
  order?: number;
  onSelect: () => void;
}

export function MarinaMarker({
  coordinates,
  count,
  label,
  selected = false,
  order = 0,
  onSelect,
}: MarinaMarkerProps) {
  return (
    <Marker longitude={coordinates.lng} latitude={coordinates.lat} anchor="center">
      <button
        type="button"
        aria-label={label}
        onClick={onSelect}
        style={{ animationDelay: `${order * 50}ms` }}
        className={cn(
          PRESS,
          "flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-semibold shadow-card",
          selected
            ? "border-brand bg-brand text-brand-foreground"
            : "border-natural-200 bg-card text-foreground",
        )}
      >
        <Ship className={cn("size-3.5", selected ? "text-brand-foreground" : "text-brand")} />
        {count}
      </button>
    </Marker>
  );
}
