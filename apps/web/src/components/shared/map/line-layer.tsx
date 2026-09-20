"use client";

import { Layer, type LineLayerSpecification, Source } from "react-map-gl/mapbox";

import { type Coordinates, toPosition } from "./geometry";

export interface LineStroke {
  color: string;
  /** In pixels. */
  width: number;
  opacity?: number;
  /** Mapbox's `line-dasharray`, in multiples of this stroke's own width rather than in pixels. */
  dash?: number[];
  /** Softens the stroke's edges, in pixels: a wide blurred stroke under a line is its glow. */
  blur?: number;
}

export interface LineLayerProps {
  /** The source's id, and the stem of every stroke's layer id. Unique per map. */
  id: string;
  coordinates: Coordinates[];
  /**
   * Painted in order, so a casing goes before the line it outlines.
   *
   * Several strokes over one source rather than one layer each with its own copy of the geometry:
   * the halo and the line then cannot drift apart while the data changes.
   */
  strokes: LineStroke[];
  /**
   * How much of the line is drawn, from its first point, `0` to `1`. Left off, all of it.
   *
   * Moved through `line-trim-offset`, a paint property, so animating it costs one property write
   * per frame rather than a re-upload of the geometry.
   */
  progress?: number;
  /** How soft the leading edge is while `progress` runs, as a fraction of the whole line. */
  fadeRange?: number;
  /** A layer already on the map to draw beneath. */
  beforeId?: string;
}

/**
 * A polyline laid on the map as data rather than drawn by hand.
 *
 * Switching the basemap style throws away every source and layer that was added imperatively, so
 * a line drawn with `addSource`/`addLayer` had to be put back by whoever drew it. `Source` and
 * `Layer` listen for the new style and re-add themselves, with whatever props they hold now.
 */
export default function LineLayer({
  id,
  coordinates,
  strokes,
  progress,
  fadeRange = 0,
  beforeId,
}: LineLayerProps) {
  if (coordinates.length < 2) return null;

  const revealing = progress != null;

  return (
    <Source
      id={id}
      type="geojson"
      /* Always on: `lineMetrics` cannot be switched after the source exists, and trimming needs it. */
      lineMetrics
      data={{
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coordinates.map(toPosition) },
      }}
    >
      {strokes.map((stroke, index) => {
        const paint: LineLayerSpecification["paint"] = {
          "line-color": stroke.color,
          "line-opacity": stroke.opacity ?? 1,
          "line-width": stroke.width,
        };
        if (stroke.dash) paint["line-dasharray"] = stroke.dash;
        if (stroke.blur) paint["line-blur"] = stroke.blur;
        if (revealing) {
          paint["line-trim-offset"] = [progress, 1];
          paint["line-trim-fade-range"] = [0, fadeRange];
        }

        return (
          <Layer
            key={index}
            id={`${id}-${index}`}
            type="line"
            beforeId={beforeId}
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={paint}
          />
        );
      })}
    </Source>
  );
}
