"use client";

import { MapPin } from "lucide-react";
import { Marker } from "react-map-gl/mapbox";

import type { Coordinates } from "../../types";

/*
 * Figma "map-pin" (node 757:29193 + 757:29170): a pin centred in a 69px disc.
 * Sampled off the mock, the disc is white at 25% with a 1px edge that composites to
 * 63% — which is a 50% border, since the fill paints under it. The disc is centred on
 * the coordinate rather than hung above it, exactly as the design draws it.
 *
 * The whole marker is scaled 1.22x off those numbers — 84px disc, 24px pin — because
 * against a live basemap the designed size reads as smaller than it does on the flat
 * mock. Both halves move together so the glyph keeps its 29% share of the disc.
 */
export type MapMarkerProps = {
  coordinates: Coordinates;
};

export default function MapMarker({ coordinates }: MapMarkerProps) {
  return (
    <Marker longitude={coordinates.lng} latitude={coordinates.lat} anchor="center">
      <span
        aria-hidden
        className="flex size-21 items-center justify-center rounded-full border border-white/50 bg-white/25"
      >
        <MapPin className="size-6 fill-brand text-white" />
      </span>
    </Marker>
  );
}
