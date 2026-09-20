"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { Route } from "lucide-react";
import { useState } from "react";
import { Marker } from "react-map-gl/mapbox";

import type { Coordinates } from "@/components/shared/map/geometry";

/*
 * A day of the itinerary: a solid green dot with its number, the colour of the route's own line.
 * Marinas wear the search map's blue ring marker, so the two read as different kinds of place
 * where they share a coast: a green dot is a day of the sail, a blue ring with a count is boats.
 */

const PRESS =
  "cursor-pointer outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-white animate-in fade-in-0 zoom-in-50 fill-mode-backwards duration-300";

export interface DayMarkerProps {
  coordinates: Coordinates;
  /** The day shown in the dot; a round trip's base shows its first. */
  day: number;
  label: string;
  /**
   * The plate under the dot: the stop's name once the map is close enough to have room for it,
   * and "Start" or "Finish" while it is not.
   */
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
          "relative flex size-8 items-center justify-center rounded-full border-2 border-white bg-positive-600 text-sm font-bold text-white shadow-card",
        )}
      >
        {day}
        {caption ? (
          <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full bg-card px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-positive-700 shadow-card">
            {caption}
          </span>
        ) : null}
      </button>
    </Marker>
  );
}

export interface RouteStartMarkerProps {
  coordinates: Coordinates;
  label: string;
  /** What the plate says while the pointer is on the marker: the route, or how many start here. */
  hint: string;
  /** More than one route sails from here, shown as a count on the corner. */
  count?: number;
  order?: number;
  onSelect: () => void;
}

/**
 * Where a route the visitor has not opened begins: a route glyph rather than a pin or a ring, so
 * three kinds of place read apart at a glance - a numbered green dot is a day of the open route, a
 * blue ring with a count is a marina's boats, and this is another itinerary to open.
 */
export function RouteStartMarker({
  coordinates,
  label,
  hint,
  count,
  order = 0,
  onSelect,
}: RouteStartMarkerProps) {
  /* Hover on a mouse, focus on a keyboard; a touch opens the route, which says the same thing. */
  const [shown, setShown] = useState(false);

  return (
    <Marker longitude={coordinates.lng} latitude={coordinates.lat} anchor="center">
      <button
        type="button"
        aria-label={label}
        onClick={onSelect}
        onPointerEnter={() => setShown(true)}
        onPointerLeave={() => setShown(false)}
        onFocus={() => setShown(true)}
        onBlur={() => setShown(false)}
        style={{ animationDelay: `${order * 50}ms` }}
        /* As wide as a marina's halo, so both kinds of place keep the same weight on the coast.
           No rings: the white disc fades into the green glow and the glow into the map, which is
           what makes it read as one mark rather than three circles. */
        className={cn(PRESS, "relative flex size-14 items-center justify-center rounded-full")}
      >
        {/* The soft green glow the route's own line wears, so a start reads as belonging to one
            even before it is opened. */}
        <span aria-hidden className="absolute inset-0 rounded-full bg-positive-500/25 blur-md" />
        <span aria-hidden className="absolute inset-2.5 rounded-full bg-white/70 blur-[6px]" />
        <span className="relative flex size-9 items-center justify-center rounded-full bg-card">
          <Route className="size-4.5 text-positive-700" />
        </span>
        {shown ? (
          <span className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 max-w-50 -translate-x-1/2 truncate rounded-full bg-card px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-positive-700 shadow-card">
            {hint}
          </span>
        ) : null}
        {count && count > 1 ? (
          <span className="absolute top-0.5 right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-positive-600 px-1 text-xs font-bold text-white">
            {count}
          </span>
        ) : null}
      </button>
    </Marker>
  );
}
