"use client";

import { env } from "@yacht-charter/env/web";
import { type ReactNode, useState } from "react";
import Map, { type MapEvent } from "react-map-gl/mapbox";

import { MAP_STYLE_URL } from "@/lib/mapbox";

const MAP_STYLE = MAP_STYLE_URL;
const DIM_LAYER_ID = "design-dim";
const DIM_OPACITY = 0.4;

const DEFAULT_VIEW_STATE = { longitude: 16.44, latitude: 43.51, zoom: 6.4 };

function styleBasemap({ target: map }: MapEvent) {
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
  const [ready, setReady] = useState(false);

  function dismissPopup(target: EventTarget | null) {
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
      onMouseDown={(event) => dismissPopup(event.originalEvent.target)}
      onTouchStart={(event) => dismissPopup(event.originalEvent.target)}
    >
      {ready ? children : null}
    </Map>
  );
}
