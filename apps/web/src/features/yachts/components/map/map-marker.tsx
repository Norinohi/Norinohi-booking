"use client";

import { MapPin } from "lucide-react";
import { Marker } from "react-map-gl/mapbox";

import type { Coordinates } from "../../types";

/*
 * Figma "map-pin" (node 757:29193 + 757:29170): a pin centred in a 69px disc.
 * White disc at 25% with a 1px white-50 edge, scaled 1.22x to 84px/24px.
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
