"use client";

import { Popup } from "react-map-gl/mapbox";

import type { Coordinates } from "../../types";

import MapBoatCard, { type MapBoatCardProps } from "./map-boat-card";

/* Mapbox draws its own bubble and tip; both are stripped so the card is the popup. */
const RESET_MAPBOX_CHROME =
  "[&_.mapboxgl-popup-content]:bg-transparent [&_.mapboxgl-popup-content]:p-0 [&_.mapboxgl-popup-content]:shadow-none [&_.mapboxgl-popup-tip]:hidden";

export type MapBoatPopupProps = {
  coordinates: Coordinates;
  boat: Omit<MapBoatCardProps, "layout" | "className">;
};

export default function MapBoatPopup({ coordinates, boat }: MapBoatPopupProps) {
  return (
    <Popup
      longitude={coordinates.lng}
      latitude={coordinates.lat}
      anchor="top"
      offset={46}
      closeButton={false}
      closeOnClick={false}
      maxWidth="none"
      className={RESET_MAPBOX_CHROME}
    >
      {/* Animated here rather than on the popup itself, whose transform mapbox owns. */}
      <div className="relative origin-top duration-200 animate-in fade-in-0 zoom-in-95">
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rotate-45 bg-card"
        />
        <MapBoatCard layout="row" {...boat} className="border-0" />
      </div>
    </Popup>
  );
}
