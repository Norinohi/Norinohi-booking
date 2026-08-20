"use client";

import { MapPin } from "lucide-react";
import { Marker } from "react-map-gl/mapbox";

import MapCanvas from "@/components/shared/data-display/map-canvas";

import type { Coordinates } from "./marina-popover";

/** None: a visitor opened this to read the harbour off the imagery. */
const DIALOG_DIM_OPACITY = 0;

/*
 * The live map behind a `MapPreview`, in its own module so `next/dynamic` has something to split
 * on: everything mapbox-gl pulls in loads with this file and nothing sooner.
 *
 * Unwashed, unlike the search map, where the layer is there to make markers read.
 */
export default function MapDialogCanvas({
  point,
  title,
  zoom,
}: {
  point: Coordinates;
  title: string;
  zoom: number;
}) {
  return (
    <MapCanvas
      dimOpacity={DIALOG_DIM_OPACITY}
      initialViewState={{ longitude: point.lng, latitude: point.lat, zoom }}
    >
      <Marker longitude={point.lng} latitude={point.lat} anchor="center">
        <span
          aria-label={title}
          className="flex size-21 items-center justify-center rounded-full border border-white/50 bg-white/25 duration-300 animate-in fade-in-0 zoom-in-50"
        >
          <MapPin className="size-6 fill-brand text-white" />
        </span>
      </Marker>
    </MapCanvas>
  );
}
