"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { MapPin } from "lucide-react";
import { Marker } from "react-map-gl/mapbox";

import type { Coordinates } from "@/components/shared/map/geometry";

const STAGGER_MS = 50;

const RING = {
  idle: "border-white/50 bg-white/25",
  selected: "border-brand bg-brand/40",
} as const;

interface MapMarkerBaseProps {
  coordinates: Coordinates;
  label: string;
  /**
   * "sm" halves the ring. The search map is all marinas and wears the full size; a map where they
   * share the coast with something else - the routes map's days - gives them less room.
   */
  size?: "md" | "sm";
  /** Position in the set, which becomes the stagger. Ignored when `delayMs` is given. */
  order?: number;
  onSelect: () => void;
}

export interface MapPinMarkerProps extends MapMarkerBaseProps {
  /** One place: a marina with a single boat, a route stop, a point in a map dialog. */
  variant: "pin";
  selected?: boolean;
  /** An exact delay instead, for a route, where a marker waits for the line to reach it. */
  delayMs?: number;
  /**
   * A word plate under the marker ("Start", "Finish") for the two places on an itinerary that
   * a reader cannot work out from the map alone.
   *
   * Deliberately words and deliberately not a corner badge: that corner holds the `cluster`
   * count, so a number there reads as *how many are here* rather than *which one this is*.
   */
  caption?: string;
}

export interface MapClusterMarkerProps extends MapMarkerBaseProps {
  /** Several places or boats grouped at this zoom, with their count in the corner. */
  variant: "cluster";
  count: number;
}

export type MapMarkerProps = MapPinMarkerProps | MapClusterMarkerProps;

export default function MapMarker(props: MapMarkerProps) {
  const { coordinates, label, order = 0, size = "md", onSelect } = props;
  const small = size === "sm";
  const cluster = props.variant === "cluster";
  const delayMs = props.variant === "pin" ? props.delayMs : undefined;

  return (
    <Marker longitude={coordinates.lng} latitude={coordinates.lat} anchor="center">
      <button
        type="button"
        aria-label={label}
        /* A cluster answers click, not pointerdown: it fires after touchend, so mapbox no longer
           cancels the zoom animation mid-flight, and a native button also fires it on Enter and
           Space. */
        onClick={cluster ? onSelect : undefined}
        onPointerDown={cluster ? undefined : onSelect}
        onKeyDown={
          cluster
            ? undefined
            : (event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onSelect();
              }
        }
        style={{ animationDelay: `${delayMs ?? order * STAGGER_MS}ms` }}
        className={cn(
          "relative flex cursor-pointer items-center justify-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white",
          "duration-300 animate-in fade-in-0 zoom-in-50 fill-mode-backwards",
          props.variant === "cluster"
            ? cn(small ? "size-11" : "size-21", "hover:bg-white/40", RING.idle)
            : /* Smaller on a phone: seven of these at 84px merge into one blur on a 343px map. */
              cn(
                small ? "size-9" : "size-12 md:size-21",
                props.selected ? RING.selected : RING.idle,
              ),
        )}
      >
        <MapPin className="size-6 fill-brand text-white" />
        {props.variant === "cluster" ? (
          <span
            className={cn(
              "absolute flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-brand px-1.5 text-xs font-semibold text-brand-foreground",
              small ? "-top-1 -right-1" : "top-1 right-1",
            )}
          >
            {props.count}
          </span>
        ) : props.caption ? (
          // 10px is below the smallest token (12); a map pin badge is meant to stay this small.
          // oxlint-disable-next-line design-tokens/no-arbitrary-size
          <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-brand-foreground shadow-brand-glow md:text-xs">
            {props.caption}
          </span>
        ) : null}
      </button>
    </Marker>
  );
}
