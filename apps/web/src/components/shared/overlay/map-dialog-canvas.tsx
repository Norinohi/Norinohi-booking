"use client";

import { type ReactNode, useState } from "react";

import MapCanvas from "@/components/shared/data-display/map-canvas";
import MapPopup from "@/components/shared/data-display/map-popup";
import MapMarker from "@/components/shared/data-display/map-marker";

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
  popup,
}: {
  point: Coordinates;
  title: string;
  zoom: number;
  /** Opened by a tap on the pin, the way the search map's markers behave. */
  popup?: ReactNode;
}) {
  const [map, setMap] = useState<Parameters<typeof MapPopup>[0]["map"]>(null);
  const [open, setOpen] = useState(false);

  return (
    <MapCanvas
      dimOpacity={DIALOG_DIM_OPACITY}
      initialViewState={{ longitude: point.lng, latitude: point.lat, zoom }}
      onReady={setMap}
      onBackgroundPress={() => setOpen(false)}
    >
      <MapMarker coordinates={point} label={title} selected={open} onSelect={() => setOpen(true)} />

      {popup && open ? (
        <MapPopup coordinates={point} map={map}>
          {popup}
        </MapPopup>
      ) : null}
    </MapCanvas>
  );
}
