"use client";

import { useEffect, useMemo, useState } from "react";
import Supercluster, { type PointFeature } from "supercluster";

import type { MapMarkerData } from "../api/queries";
import type { MapInstance } from "@/components/shared/data-display/map-canvas";

const CLUSTER_RADIUS = 60;
/*
 * Mapbox's own ceiling, so clusters exist at every zoom the map can reach. Stopping lower let the
 * index hand back raw points past that level, and boats sharing a marina's coordinates went back to
 * sitting on top of each other with no cluster left to click.
 */
const CLUSTER_MAX_ZOOM = 22;

type Viewport = { bbox: [number, number, number, number]; zoom: number };

function readViewport(map: MapInstance): Viewport | null {
  const bounds = map.getBounds();
  if (!bounds) return null;
  return {
    bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
    zoom: Math.floor(map.getZoom()),
  };
}

/*
 * Groups the search markers with supercluster so a marina full of boats reads as one count pill
 * instead of a stack of overlapping pins. The index is rebuilt only when the marker set changes; the
 * viewport is re-read on pan/zoom (and once the map is ready). `getClusters` returns cluster features
 * and lone-point features for the current bounds; `map-screen` renders each accordingly, and keeps the
 * `supercluster` instance to expand a cluster (zoom) or list its boats (tight marina).
 */
export function useMapClusters(markers: MapMarkerData[], map: MapInstance | null) {
  const supercluster = useMemo(() => {
    const index = new Supercluster<MapMarkerData>({
      radius: CLUSTER_RADIUS,
      maxZoom: CLUSTER_MAX_ZOOM,
    });
    const points: PointFeature<MapMarkerData>[] = markers.map((marker) => ({
      type: "Feature",
      properties: marker,
      geometry: { type: "Point", coordinates: [marker.lng, marker.lat] },
    }));
    index.load(points);
    return index;
  }, [markers]);

  const [viewport, setViewport] = useState<Viewport | null>(null);

  useEffect(() => {
    if (!map) {
      setViewport(null);
      return;
    }

    const update = () => {
      const next = readViewport(map);
      if (next) setViewport(next);
    };

    update();
    map.on("moveend", update);
    map.on("zoomend", update);
    return () => {
      map.off("moveend", update);
      map.off("zoomend", update);
    };
  }, [map]);

  const clusters = useMemo(() => {
    if (!viewport) return [];
    return supercluster.getClusters(viewport.bbox, viewport.zoom);
  }, [supercluster, viewport]);

  return { clusters, supercluster };
}
