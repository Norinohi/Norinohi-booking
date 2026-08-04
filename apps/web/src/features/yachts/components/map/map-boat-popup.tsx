"use client";

import { useEffect, useRef } from "react";
import { Popup } from "react-map-gl/mapbox";

import type { Coordinates } from "@/components/shared/overlay/marina-popover";

import MapBoatCard, { type MapBoatCardProps } from "./map-boat-card";
import type { MapInstance } from "./map-canvas";

const RESET_MAPBOX_CHROME =
  "[&_.mapboxgl-popup-content]:bg-transparent [&_.mapboxgl-popup-content]:p-0 [&_.mapboxgl-popup-content]:shadow-none [&_.mapboxgl-popup-tip]:hidden";

const PIN_CLEARANCE = 46;
const RECENTRE_MS = 500;

export type MapBoatPopupProps = {
  coordinates: Coordinates;
  boat: Omit<MapBoatCardProps, "layout" | "className">;
  map: MapInstance | null;
};

export default function MapBoatPopup({ coordinates, boat, map }: MapBoatPopupProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!map) return;

    const frame = requestAnimationFrame(() => {
      const height = cardRef.current?.getBoundingClientRect().height ?? 0;

      map.easeTo({
        center: [coordinates.lng, coordinates.lat],
        offset: [0, -(PIN_CLEARANCE + height / 2)],
        duration: RECENTRE_MS,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [map, coordinates.lng, coordinates.lat]);

  return (
    <Popup
      longitude={coordinates.lng}
      latitude={coordinates.lat}
      anchor="top"
      offset={PIN_CLEARANCE}
      closeButton={false}
      closeOnClick={false}
      maxWidth="none"
      className={RESET_MAPBOX_CHROME}
    >
      <div
        ref={cardRef}
        className="relative origin-top duration-200 animate-in fade-in-0 zoom-in-95"
      >
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rotate-45 bg-card"
        />
        <MapBoatCard layout="popup" {...boat} className="border-0" />
      </div>
    </Popup>
  );
}
