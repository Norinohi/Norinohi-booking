"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { MapPin } from "lucide-react";
import { Marker } from "react-map-gl/mapbox";

import type { Coordinates } from "@/components/shared/overlay/marina-popover";

const STAGGER_MS = 50;

export type MapClusterMarkerProps = {
  coordinates: Coordinates;
  count: number;
  label: string;
  order?: number;
  onSelect: () => void;
};

export default function MapClusterMarker({
  coordinates,
  count,
  label,
  order = 0,
  onSelect,
}: MapClusterMarkerProps) {
  return (
    <Marker longitude={coordinates.lng} latitude={coordinates.lat} anchor="center">
      <button
        type="button"
        aria-label={label}
        // click (not pointerdown): it fires after touchend, so mapbox no longer cancels the zoom
        // animation mid-flight. A native button also fires click on Enter/Space, so keys still work.
        onClick={onSelect}
        style={{ animationDelay: `${order * STAGGER_MS}ms` }}
        className={cn(
          "relative flex size-21 cursor-pointer items-center justify-center rounded-full border border-white/50 bg-white/25 outline-none transition-colors hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-white",
          "duration-300 animate-in fade-in-0 zoom-in-50 fill-mode-backwards",
        )}
      >
        <MapPin className="size-6 fill-brand text-white" />
        <span className="absolute top-1 right-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-brand px-1.5 text-xs font-semibold text-brand-foreground">
          {count}
        </span>
      </button>
    </Marker>
  );
}
