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
  order?: number;
  onSelect: () => void;
};

export default function MapMarker({
  coordinates,
  label,
  selected,
  order = 0,
  onSelect,
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
        style={{ animationDelay: `${order * STAGGER_MS}ms` }}
        className={cn(
          "flex size-21 cursor-pointer items-center justify-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white",
          "duration-300 animate-in fade-in-0 zoom-in-50 fill-mode-backwards",
          selected ? "border-brand bg-brand/40" : "border-white/50 bg-white/25",
        )}
      >
        <MapPin className="size-6 fill-brand text-white" />
      </button>
    </Marker>
  );
}
