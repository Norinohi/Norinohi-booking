"use client";

import { useEffect, useState } from "react";

import LineLayer, { type LineStroke } from "./line-layer";
import { ROUTE_DRAW_MS, type RouteCurve } from "./route-points";

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

/*
 * The routes map's own: one thin solid green line over a white casing, matching its day markers.
 * Solid because that map is read as a course from place to place rather than as an illustration,
 * and a dashed line broke up at the zooms where the whole itinerary is on screen.
 */
export const SAILED_ROUTE_STROKES: LineStroke[] = [
  /* The glow: a wide, blurred, dim copy under the line, so the course reads over both the dark
     water of the satellite map and the pale sea of the street one. */
  { color: "#22c55e", opacity: 0.35, width: 9, blur: 6 },
  { color: "#ffffff", opacity: 0.85, width: 3 },
  { color: "#16a34a", opacity: 1, width: 1.5 },
];
const ROUTE_FADE_RANGE = 0.08;

/**
 * Lays the itinerary on the map and draws it in.
 *
 * `line-trim-fade-range` softens the leading edge so the line runs on rather than being cut off.
 *
 * Mounted with the map's children, which is on its first idle rather than on load: the markers
 * mount then, and satellite tiles can put seconds between the two - starting earlier would have
 * the line arrive at stops that are not drawn yet.
 */
export interface RouteLineProps {
  curve: RouteCurve;
  animate: boolean;
  /** Left off, the listing page's dashed blue line. */
  strokes?: LineStroke[];
}

export default function RouteLine({ curve, animate, strokes = ROUTE_STROKES }: RouteLineProps) {
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
      strokes={strokes}
      progress={animate ? progress : 1}
      fadeRange={ROUTE_FADE_RANGE}
    />
  );
}
