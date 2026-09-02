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

/*
 * How far past the edge of the screen clusters are built, as a fraction of the visible span.
 *
 * A pan that stays inside that margin re-uses the set already on the map, so ordinary dragging costs
 * no re-clustering at all and the markers coming in from the side are drawn before the edge reaches
 * them. Only a view that leaves the margin, or a new zoom level, is worth rebuilding for.
 */
const OVERSCAN = 0.2;

type Bounds = [number, number, number, number];

type Viewport = {
  /** What the clusters were built for: the screen plus its margin. */
  bbox: Bounds;
  /** What was actually on screen when it was taken, which is what tells a small pan from a big one. */
  visible: Bounds;
  zoom: number;
};

function readViewport(map: MapInstance): Viewport | null {
  const canvas = map.getContainer();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (width === 0 || height === 0) return null;

  /*
   * The corners of the canvas, rather than `getBounds()`.
   *
   * `getBounds` answers for the padded box the camera composes within, and the search map pads that
   * box by the width of the panels lying over it — so asking it what is on screen would leave the
   * edges of the screen unclustered, markers and all. All four corners, and not just two, because
   * a rotated map's bounding box is not its top-left and bottom-right.
   */
  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].map(([x, y]) => map.unproject([x, y]));
  const lngs = corners.map((corner) => corner.lng);
  const lats = corners.map((corner) => corner.lat);

  const west = Math.min(...lngs);
  const south = Math.min(...lats);
  const east = Math.max(...lngs);
  const north = Math.max(...lats);
  const padX = (east - west) * OVERSCAN;
  const padY = (north - south) * OVERSCAN;

  return {
    bbox: [west - padX, south - padY, east + padX, north + padY],
    visible: [west, south, east, north],
    zoom: Math.floor(map.getZoom()),
  };
}

function hasEscaped(current: Viewport | null, next: Viewport): boolean {
  if (!current || current.zoom !== next.zoom) return true;
  const [west, south, east, north] = current.bbox;
  const [nextWest, nextSouth, nextEast, nextNorth] = next.visible;
  return nextWest < west || nextSouth < south || nextEast > east || nextNorth > north;
}

/*
 * Groups the search markers with supercluster so a marina full of boats reads as one count pill
 * instead of a stack of overlapping pins. The index is rebuilt only when the marker set changes;
 * `getClusters` returns cluster features and lone-point features for the current bounds, `map-screen`
 * renders each accordingly and keeps the `supercluster` instance to expand a cluster (zoom) or list
 * its boats (tight marina).
 *
 * The viewport is read while the camera moves rather than after it stops. Waiting for `zoomend` meant
 * a pinch ran its whole length against clusters built for the zoom it started at, and they all jumped
 * to their new places the moment it ended; now each level splits its clusters as it is crossed. The
 * frame is what keeps that affordable — one read per painted frame at most — and `hasEscaped` is what
 * keeps it cheap, since most of those reads describe a view the current set already covers.
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

    let frame = 0;

    const update = () => {
      frame = 0;
      const next = readViewport(map);
      if (next) setViewport((current) => (hasEscaped(current, next) ? next : current));
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    /* The end of a gesture is read straight away rather than queued: a frame that never comes —
       a backgrounded tab, a starved main thread — would otherwise leave the last move unread. */
    const settle = () => {
      cancelAnimationFrame(frame);
      update();
    };

    update();
    map.on("move", schedule);
    map.on("zoom", schedule);
    map.on("resize", schedule);
    map.on("moveend", settle);
    map.on("zoomend", settle);
    return () => {
      cancelAnimationFrame(frame);
      map.off("move", schedule);
      map.off("zoom", schedule);
      map.off("resize", schedule);
      map.off("moveend", settle);
      map.off("zoomend", settle);
    };
  }, [map]);

  const clusters = useMemo(() => {
    if (!viewport) return [];
    return supercluster.getClusters(viewport.bbox, viewport.zoom);
  }, [supercluster, viewport]);

  return { clusters, supercluster };
}
