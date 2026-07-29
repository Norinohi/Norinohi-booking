"use client";

import { env } from "@yacht-charter/env/web";
import { type ReactNode, useState } from "react";
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

/*
 * Nudges Streets towards the Google basemap the mock was screenshotted from. Only two
 * things actually give it away: Streets paints land cream and motorways orange, where
 * Google has green land and white roads under a grey casing. Water is left alone — the
 * two are already within a few points of each other.
 * Values are sampled from the Figma export with its 40% scrim divided back out.
 */
const PALETTE = [
  ["land", "background-color", "hsl(141, 54%, 87%)"],
  ["road-motorway-trunk", "line-color", "hsl(0, 0%, 100%)"],
  ["road-motorway-trunk-case", "line-color", "hsl(220, 20%, 85%)"],
] as const;

function styleBasemap({ target: map }: MapEvent) {
  for (const [layer, property, value] of PALETTE) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property, value);
  }

  /* Dims tiles only — markers and cards are DOM above the canvas, so an overlay would
     catch them too. */
  if (!map.getLayer(DIM_LAYER_ID)) {
    map.addLayer({
      id: DIM_LAYER_ID,
      type: "background",
      paint: { "background-color": "#000000", "background-opacity": DIM_OPACITY },
    });
  }
}

export type MapInstance = MapEvent["target"];

export default function MapCanvas({
  children,
  onReady,
  onBackgroundPress,
}: {
  children?: ReactNode;
  onReady?: (map: MapInstance) => void;
  onBackgroundPress?: () => void;
}) {
  /*
   * Children wait for `idle` — the point where every visible tile is drawn and the map
   * has settled. `load` only means the style parsed, which on a slow connection still
   * leaves them animating over blank canvas. It repeats after every pan, but the state
   * only ever moves once.
   */
  const [ready, setReady] = useState(false);

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
      onLoad={(event) => {
        styleBasemap(event);
        onReady?.(event.target);
      }}
      onIdle={() => setReady(true)}
      onMouseDown={(event) => dismiss(event.originalEvent.target)}
      onTouchStart={(event) => dismiss(event.originalEvent.target)}
    >
      {ready ? children : null}
    </Map>
  );
}
