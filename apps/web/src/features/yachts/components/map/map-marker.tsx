"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { MapPin } from "lucide-react";
import { Marker } from "react-map-gl/mapbox";

import type { Coordinates } from "../../types";

/*
 * Figma "map-pin" (node 757:29193 + 757:29170): a pin centred in a 69px disc.
 * White disc at 25% with a 1px white-50 edge, scaled 1.22x to 84px/24px.
 *
 * Selection runs on `pointerdown`, not `click`. Mapbox cancels the next click at the
 * window capture phase whenever the cursor drifts past its 3px `clickTolerance` between
 * press and release — which a trackpad does almost every time — so no click ever arrives.
 * Keyboard is handled separately for the same reason.
 */
export type MapMarkerProps = {
  coordinates: Coordinates;
  label: string;
  selected?: boolean;
  onSelect: () => void;
};

export default function MapMarker({ coordinates, label, selected, onSelect }: MapMarkerProps) {
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
        className={cn(
          "flex size-21 cursor-pointer items-center justify-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white",
          selected ? "border-brand bg-brand/40" : "border-white/50 bg-white/25",
        )}
      >
        <MapPin className="size-6 fill-brand text-white" />
      </button>
    </Marker>
  );
}
