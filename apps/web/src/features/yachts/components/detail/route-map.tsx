"use client";

import { useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { boundsOf, type Coordinates } from "@/components/shared/map/geometry";
import LineLayer, { type LineStroke } from "@/components/shared/map/line-layer";
import MapCanvas, { type MapInstance, type MapViewState } from "@/components/shared/map/map-canvas";
import MapMarker from "@/components/shared/map/map-marker";
import MapPopup from "@/components/shared/map/map-popup";
import {
  arrivalOf,
  ROUTE_DRAW_MS,
  type RouteCurve,
  type RoutePoint,
  routeCaption,
  routeCurve,
  routePoints,
} from "../../lib/route-points";

type Stop = { day: number; title: string; description: string | null; lat: number; lng: number };

const ROUTE_SOURCE = "route-curve";
/*
 * The marker's own colours — white ring, brand core — so the route reads as one piece with them.
 *
 * Thin and dash-dotted, because the stops are the content and a solid line drew the eye along the
 * water instead. `line-dasharray` is in multiples of the layer's own width, so the two patterns are
 * scaled to land on the same pixels and the casing reads as a halo around each dash.
 */
const ROUTE_STROKES: LineStroke[] = [
  { color: "#ffffff", opacity: 0.9, width: 3, dash: [3, 2, 0.5, 2] },
  { color: "#2f80ed", opacity: 1, width: 1.5, dash: [6, 4, 1, 4] },
];
const ROUTE_FADE_RANGE = 0.08;
const FIT_PADDING = 80;
const ZOOM_OUT_LIMIT = 1;
/* Constructed this much wider than it settles at, so opening reads as easing in rather than a cut. */
const OPENING_PADDING = 190;
const SETTLE_MS = 1100;

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
            {stop.description ? (
              <p className="text-sm leading-4.5 text-natural-500">{stop.description}</p>
            ) : null}
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
 * `line-trim-fade-range` softens the leading edge so the line runs on rather than being cut off.
 *
 * Mounted with the map's children, which is on its first idle rather than on load: the markers
 * mount then, and satellite tiles can put seconds between the two - starting earlier would have
 * the line arrive at stops that are not drawn yet.
 */
function RouteLine({ curve, animate }: { curve: RouteCurve; animate: boolean }) {
  const [progress, setProgress] = useState(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) return;

    const started = performance.now();
    let frame = 0;
    const step = () => {
      const next = Math.min((performance.now() - started) / ROUTE_DRAW_MS, 1);
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [animate]);

  /* A style swap re-adds the line at whatever this holds, so one that lands mid-reveal carries on
     from where it was rather than starting over. */
  return (
    <LineLayer
      id={ROUTE_SOURCE}
      coordinates={curve.points}
      strokes={ROUTE_STROKES}
      progress={animate ? progress : 1}
      fadeRange={ROUTE_FADE_RANGE}
    />
  );
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
      }}
      onBackgroundPress={() => setSelected(null)}
    >
      <RouteLine curve={curve} animate={!reduced} />

      {points.map((point, index) => (
        <MapMarker
          key={`${point.lat},${point.lng}`}
          variant="pin"
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
