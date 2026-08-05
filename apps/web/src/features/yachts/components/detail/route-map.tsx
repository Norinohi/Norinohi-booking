"use client";

import { useEffect, useRef, useState } from "react";
import { Popup } from "react-map-gl/mapbox";

import type { Coordinates } from "@/components/shared/overlay/marina-popover";

import MapCanvas, { type MapInstance } from "../map/map-canvas";
import MapMarker from "../map/map-marker";

type Stop = { title: string; description: string; lat: number; lng: number };

const RESET_MAPBOX_CHROME =
  "[&_.mapboxgl-popup-content]:bg-transparent [&_.mapboxgl-popup-content]:p-0 [&_.mapboxgl-popup-content]:shadow-none [&_.mapboxgl-popup-tip]:hidden";
const PIN_CLEARANCE = 46;
const RECENTRE_MS = 500;
const FIT_PADDING = 80;
const ZOOM_OUT_LIMIT = 1;

function RouteStopPopup({
  coordinates,
  title,
  description,
  map,
}: {
  coordinates: Coordinates;
  title: string;
  description: string;
  map: MapInstance | null;
}) {
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
        className="relative w-72 origin-top duration-200 animate-in fade-in-0 zoom-in-95"
      >
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rotate-45 bg-card"
        />
        <div className="relative flex flex-col gap-1.5 rounded-2xl bg-card p-4 shadow-[4px_4px_15px_rgba(47,128,237,0.15)]">
          <p className="text-base leading-5.5 font-bold text-foreground">{title}</p>
          <p className="text-sm leading-4.5 text-natural-500">{description}</p>
        </div>
      </div>
    </Popup>
  );
}

function fitToStops(map: MapInstance, stops: Stop[]) {
  if (stops.length === 1) {
    map.jumpTo({ center: [stops[0].lng, stops[0].lat], zoom: 10 });
    map.setMinZoom(10 - ZOOM_OUT_LIMIT);
    return;
  }

  let minLng = stops[0].lng;
  let maxLng = stops[0].lng;
  let minLat = stops[0].lat;
  let maxLat = stops[0].lat;
  for (const stop of stops) {
    minLng = Math.min(minLng, stop.lng);
    maxLng = Math.max(maxLng, stop.lng);
    minLat = Math.min(minLat, stop.lat);
    maxLat = Math.max(maxLat, stop.lat);
  }

  const bounds: [[number, number], [number, number]] = [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
  const camera = map.cameraForBounds(bounds, { padding: FIT_PADDING });
  if (!camera) {
    map.fitBounds(bounds, { padding: FIT_PADDING, animate: false });
    return;
  }

  map.jumpTo(camera);
  map.setMinZoom((camera.zoom ?? map.getZoom()) - ZOOM_OUT_LIMIT);
}

export default function RouteMap({ stops }: { stops: Stop[] }) {
  const [map, setMap] = useState<MapInstance | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  if (!stops.length) return null;

  const active = selected != null ? stops[selected] : undefined;

  return (
    <MapCanvas
      onReady={(instance) => {
        setMap(instance);
        fitToStops(instance, stops);
      }}
      onBackgroundPress={() => setSelected(null)}
    >
      {stops.map((stop, index) => (
        <MapMarker
          key={stop.title}
          coordinates={{ lat: stop.lat, lng: stop.lng }}
          label={stop.title}
          selected={selected === index}
          order={index}
          onSelect={() => setSelected(index)}
        />
      ))}

      {active ? (
        <RouteStopPopup
          key={selected}
          coordinates={{ lat: active.lat, lng: active.lng }}
          title={active.title}
          description={active.description}
          map={map}
        />
      ) : null}
    </MapCanvas>
  );
}
