"use client";

import { useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { Coordinates } from "@/components/shared/overlay/marina-popover";

import MapPopup from "@/components/shared/data-display/map-popup";
import MapCanvas, {
  type MapInstance,
  type MapViewState,
} from "@/components/shared/data-display/map-canvas";
import MapMarker from "@/components/shared/data-display/map-marker";
import {
  arrivalOf,
  ROUTE_DRAW_MS,
  type RouteCurve,
  type RoutePoint,
  routeCaption,
  routeCurve,
  routePoints,
} from "../../lib/route-points";

type Stop = { day: number; title: string; description: string; lat: number; lng: number };

const ROUTE_SOURCE = "route-curve";
/* The marker's own colours — white ring, brand core — so the route reads as one piece with them. */
const ROUTE_LAYERS = [
  { id: "route-curve-casing", color: "#ffffff", opacity: 0.9, width: 6 },
  { id: "route-curve-line", color: "#2f80ed", opacity: 1, width: 3 },
];
const FIT_PADDING = 80;
const ZOOM_OUT_LIMIT = 1;
/* Constructed this much wider than it settles at, so opening reads as easing in rather than a cut. */
const OPENING_PADDING = 190;
const SETTLE_MS = 1100;

function boundsOf(stops: Stop[]): [[number, number], [number, number]] {
  const lngs = stops.map((stop) => stop.lng);
  const lats = stops.map((stop) => stop.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/**
 * The camera the map opens with.
 *
 * `bounds` is resolved by mapbox during construction, against the container it is being built in,
 * so the route is on screen from the first frame. Framing it afterwards meant opening on the
 * default view and jumping continents.
 */
function openingView(stops: Stop[]): MapViewState {
  if (stops.length === 1 && stops[0]) {
    return { longitude: stops[0].lng, latitude: stops[0].lat, zoom: 10 };
  }
  return { bounds: boundsOf(stops), fitBoundsOptions: { padding: OPENING_PADDING } };
}

function RouteStopPopup({
  coordinates,
  stops,
  map,
}: {
  coordinates: Coordinates;
  /** Every day that happens here. More than one where the route comes back to the same marina. */
  stops: Stop[];
  map: MapInstance | null;
}) {
  return (
    <MapPopup coordinates={coordinates} map={map} className="w-72">
      <div className="relative flex flex-col gap-1.5 rounded-2xl bg-card p-4 shadow-[4px_4px_15px_rgba(47,128,237,0.15)]">
        {stops.map((stop) => (
          <div key={stop.day} className="flex flex-col gap-1.5">
            <p className="text-base leading-5.5 font-bold text-foreground">{stop.title}</p>
            <p className="text-sm leading-4.5 text-natural-500">{stop.description}</p>
          </div>
        ))}
      </div>
    </MapPopup>
  );
}

/** Closes the gap between the wide view it opened at and the one it should rest at. */
function settleOnStops(map: MapInstance, stops: Stop[], animate: boolean) {
  if (stops.length === 1) {
    map.setMinZoom(10 - ZOOM_OUT_LIMIT);
    return;
  }

  const bounds = boundsOf(stops);
  const camera = map.cameraForBounds(bounds, { padding: FIT_PADDING });
  if (!camera) {
    map.fitBounds(bounds, { padding: FIT_PADDING, animate });
    return;
  }

  map.setMinZoom((camera.zoom ?? map.getZoom()) - ZOOM_OUT_LIMIT);
  map.easeTo({ ...camera, duration: animate ? SETTLE_MS : 0 });
}

/**
 * Lays the itinerary on the map and draws it in.
 *
 * `line-trim-offset` is a paint property, so the reveal costs one property write per frame rather
 * than a re-upload of the geometry; `line-trim-fade-range` softens the leading edge so the line
 * runs on rather than being cut off.
 */
function drawRoute(map: MapInstance, curve: RouteCurve, animate: boolean) {
  if (curve.points.length < 2 || map.getSource(ROUTE_SOURCE)) return;

  map.addSource(ROUTE_SOURCE, {
    type: "geojson",
    lineMetrics: true,
    data: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: curve.points.map((point) => [point.lng, point.lat]),
      },
    },
  });

  for (const layer of ROUTE_LAYERS) {
    map.addLayer({
      id: layer.id,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": layer.color,
        "line-opacity": layer.opacity,
        "line-width": layer.width,
        "line-trim-offset": animate ? [0, 1] : [1, 1],
        "line-trim-fade-range": [0, 0.08],
      },
    });
  }

  if (!animate) return;

  /* On idle, not on load: the markers mount then, and satellite tiles can put seconds between the
     two — starting earlier would have the line arrive at stops that are not drawn yet. */
  map.once("idle", () => {
    const started = performance.now();
    const step = () => {
      if (!map.getLayer(ROUTE_LAYERS[0].id)) return;

      const progress = Math.min((performance.now() - started) / ROUTE_DRAW_MS, 1);
      for (const layer of ROUTE_LAYERS) {
        map.setPaintProperty(layer.id, "line-trim-offset", [progress, 1]);
      }
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** The places, not the days: two days at one marina are one marker carrying both numbers. */
const pointLabel = (point: RoutePoint) => point.stops.map((stop) => stop.title).join(", ");

export default function RouteMap({ stops }: { stops: Stop[] }) {
  const t = useTranslations("YachtDetail.route");
  const reduced = useReducedMotion();
  const [map, setMap] = useState<MapInstance | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  if (!stops.length) return null;

  const words = {
    start: t("start"),
    finish: t("finish"),
    day: (day: number) => t("day", { day }),
  };
  const points = routePoints(stops);
  const curve = routeCurve(stops);

  const active = selected != null ? points[selected] : undefined;

  return (
    <MapCanvas
      initialViewState={openingView(stops)}
      onReady={(instance) => {
        setMap(instance);
        settleOnStops(instance, stops, !reduced);
        drawRoute(instance, curve, !reduced);
      }}
      /* A style swap drops the route's source and layers, so they go back on — already drawn,
         since the visitor has watched it once and is now looking at the map, not the reveal. */
      onStyleChange={(instance) => drawRoute(instance, curve, false)}
      onBackgroundPress={() => setSelected(null)}
    >
      {points.map((point, index) => (
        <MapMarker
          key={`${point.lat},${point.lng}`}
          coordinates={{ lat: point.lat, lng: point.lng }}
          label={pointLabel(point)}
          caption={routeCaption(point, stops, words)}
          selected={selected === index}
          delayMs={reduced ? 0 : arrivalOf(curve, point) * ROUTE_DRAW_MS}
          onSelect={() => setSelected(index)}
        />
      ))}

      {active ? (
        <RouteStopPopup
          key={selected}
          coordinates={{ lat: active.lat, lng: active.lng }}
          stops={active.stops}
          map={map}
        />
      ) : null}
    </MapCanvas>
  );
}
