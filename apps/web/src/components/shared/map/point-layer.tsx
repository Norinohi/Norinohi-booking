"use client";

import { Layer, Source } from "react-map-gl/mapbox";

import { type Coordinates, toPosition } from "./geometry";

export interface MapPoint {
  id: string;
  coordinates: Coordinates;
}

export interface PointLayerProps {
  /** The source's id, and the layer's. Unique per map. */
  id: string;
  points: MapPoint[];
  color: string;
  /** In pixels. */
  radius: number;
  opacity?: number;
  strokeColor?: string;
  strokeWidth?: number;
  beforeId?: string;
}

/**
 * Many small places at once, painted by the map itself.
 *
 * For the points that are scenery rather than something to press - fuel docks, anchorages, the
 * rest of a coastline's infrastructure. Every `MapMarker` is a DOM node the browser lays out on
 * each camera frame, which is right for a handful of results and far too slow for hundreds of
 * points; a circle layer draws them on the GPU and, like `LineLayer`, survives a style switch.
 */
export default function PointLayer({
  id,
  points,
  color,
  radius,
  opacity = 1,
  strokeColor = "#ffffff",
  strokeWidth = 0,
  beforeId,
}: PointLayerProps) {
  return (
    <Source
      id={id}
      type="geojson"
      data={{
        type: "FeatureCollection",
        features: points.map((point) => ({
          type: "Feature",
          properties: { id: point.id },
          geometry: { type: "Point", coordinates: toPosition(point.coordinates) },
        })),
      }}
    >
      <Layer
        id={id}
        type="circle"
        beforeId={beforeId}
        paint={{
          "circle-color": color,
          "circle-radius": radius,
          "circle-opacity": opacity,
          "circle-stroke-color": strokeColor,
          "circle-stroke-width": strokeWidth,
        }}
      />
    </Source>
  );
}
