"use client";

import { env } from "@yacht-charter/env/web";
import type { ReactNode } from "react";
import Map from "react-map-gl/mapbox";

import "mapbox-gl/dist/mapbox-gl.css";

/*
 * The live Mapbox canvas. `mapbox-gl` touches `window` while it initialises, so this
 * module must never be imported from a server component — `map-screen` pulls it in
 * through `next/dynamic` with `ssr: false`.
 */
const MAP_STYLE = "mapbox://styles/mapbox/streets-v12";

/** Replaced by the search bounds once the backend lands. */
const DEFAULT_VIEW_STATE = { longitude: 16.44, latitude: 43.51, zoom: 6.4 };

export default function MapCanvas({ children }: { children?: ReactNode }) {
  return (
    <Map
      mapboxAccessToken={env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={DEFAULT_VIEW_STATE}
      mapStyle={MAP_STYLE}
      style={{ width: "100%", height: "100%" }}
    >
      {children}
    </Map>
  );
}
