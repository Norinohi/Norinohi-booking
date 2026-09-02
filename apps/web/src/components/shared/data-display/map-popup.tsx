"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { type ReactNode, useEffect, useRef } from "react";
import { Popup } from "react-map-gl/mapbox";

import type { MapInstance } from "@/components/shared/data-display/map-canvas";
import type { Coordinates } from "@/components/shared/overlay/marina-popover";

const RESET_MAPBOX_CHROME =
  "[&_.mapboxgl-popup-content]:bg-transparent [&_.mapboxgl-popup-content]:p-0 [&_.mapboxgl-popup-content]:shadow-none [&_.mapboxgl-popup-tip]:hidden";

/** How far above the card the marker's pin sits, so the two never overlap. */
export const PIN_CLEARANCE = 46;

/**
 * How long the map takes to move a marker's card into view.
 *
 * Past mapbox's own 500ms default: a camera that arrives before the eye has followed it reads as a
 * cut rather than a move, and the visitor has to find the boat again on a screen that changed under
 * them. Exported because the search map's card is nudged by its own rule and has to keep the pace.
 */
export const RECENTRE_MS = 700;

export type MapPopupProps = {
  coordinates: Coordinates;
  /** Needed to move the map so the card is not half off it. */
  map: MapInstance | null;
  children: ReactNode;
  /** Styles the card wrapper — its width and, where a caller stacks parts, their layout. */
  className?: string;
  /**
   * Replaces the default nudge with the caller's own, given the card's measured height.
   *
   * The search map needs it: with several boats the card is tall and carries a pager, so on a
   * phone it is pinned to the bottom instead of centred, and a deep link flies rather than eases.
   */
  onOpen?: (height: number) => void;
};

/**
 * The card a marker opens, and the parts of that every map needs alike.
 *
 * The map surfaces differ in what they put in the card — a boat, a day of an itinerary, a marina —
 * but not in how the card is hung: mapbox's own popup chrome stripped, the app's arrow under it,
 * and a nudge on open so the card clears the top of the map.
 */
export default function MapPopup({ coordinates, map, children, className, onOpen }: MapPopupProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    if (!map) return;

    /* Measured a frame later: the card is laid out by then, and its height decides the nudge. */
    const frame = requestAnimationFrame(() => {
      const height = cardRef.current?.getBoundingClientRect().height ?? 0;
      const recentre = onOpenRef.current;

      if (recentre) {
        recentre(height);
        return;
      }

      map.easeTo({
        center: [coordinates.lng, coordinates.lat],
        offset: [0, -(PIN_CLEARANCE + height / 2)],
        duration: RECENTRE_MS,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [map, coordinates.lng, coordinates.lat]);

  return (
    <Popup
      longitude={coordinates.lng}
      latitude={coordinates.lat}
      anchor="top"
      offset={PIN_CLEARANCE}
      closeButton={false}
      closeOnClick={false}
      maxWidth="none"
      className={RESET_MAPBOX_CHROME}
    >
      <div
        ref={cardRef}
        className={cn(
          "relative origin-top duration-200 animate-in fade-in-0 zoom-in-95",
          className,
        )}
      >
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rotate-45 bg-card"
        />
        {children}
      </div>
    </Popup>
  );
}
