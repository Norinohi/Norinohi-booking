"use client";

import { MapPin } from "lucide-react";
import { Marker } from "react-map-gl/mapbox";

import MapCanvas from "@/components/shared/data-display/map-canvas";

import type { Coordinates } from "./marina-popover";

/** Half the search map's wash: enough to settle the basemap, not enough to hide its labels. */
const DIALOG_DIM_OPACITY = 0.2;

/*
 * The live map behind a `MapPreview`, in its own module so `next/dynamic` has something to split
 * on: everything mapbox-gl pulls in loads with this file and nothing sooner.
 *
 * Washed lighter than the search map. The full-strength layer there makes markers read against
 * the terrain; here it would take the street and place names a visitor opened this to read, while
 * a little of it still settles the map's own colours behind the pin.
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
          className="flex size-21 items-center justify-center rounded-full border border-white/50 bg-white/25"
        >
          <MapPin className="size-6 fill-brand text-white" />
        </span>
      </Marker>
    </MapCanvas>
  );
}
