"use client";

import { env } from "@yacht-charter/env/web";
import type { ReactNode } from "react";
import Map, { type MapEvent } from "react-map-gl/mapbox";

/*
 * The live Mapbox canvas. `mapbox-gl` touches `window` while it initialises, so this
 * module must never be imported from a server component — `map-screen` pulls it in
 * through `next/dynamic` with `ssr: false`.
 */
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";
const DIM_LAYER_ID = "design-dim";
const DIM_OPACITY = 0.4;

/** Replaced by the search bounds once the backend lands. */
const DEFAULT_VIEW_STATE = { longitude: 16.44, latitude: 43.51, zoom: 6.4 };

/* Dims tiles only — markers and cards are DOM above the canvas, so an overlay would catch them too. */
function dimBasemap({ target: map }: MapEvent) {
  if (map.getLayer(DIM_LAYER_ID)) return;

  map.addLayer({
    id: DIM_LAYER_ID,
    type: "background",
    paint: { "background-color": "#000000", "background-opacity": DIM_OPACITY },
  });
}

export default function MapCanvas({
  children,
  onBackgroundPress,
}: {
  children?: ReactNode;
  onBackgroundPress?: () => void;
}) {
  function dismiss(target: EventTarget | null) {
    if (target instanceof Element && target.closest(".mapboxgl-marker")) return;
    onBackgroundPress?.();
  }

  return (
    <Map
      mapboxAccessToken={env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={DEFAULT_VIEW_STATE}
      mapStyle={MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
      onLoad={dimBasemap}
      onMouseDown={(event) => dismiss(event.originalEvent.target)}
      onTouchStart={(event) => dismiss(event.originalEvent.target)}
    >
      {children}
    </Map>
  );
}
