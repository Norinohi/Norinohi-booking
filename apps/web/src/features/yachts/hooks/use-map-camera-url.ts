"use client";

import { throttle, useQueryStates } from "nuqs";
import { useEffect } from "react";

import type { MapInstance } from "@/components/shared/map/map-canvas";

import { mapCameraParsers } from "../lib/search-params";

// The camera is written to the URL on every settle; this is the ceiling on how often that reaches
// the address bar while somebody is working the map.
const CAMERA_WRITE_MS = 500;

/**
 * The search map's camera as the URL holds it.
 *
 * Reading and writing are two hooks because the writer's effect has to be registered after the
 * search is framed: a first fit that jumps rather than flies ends in `moveend` there and then, and
 * a listener already attached would put a camera in the URL of a visitor who never touched the map.
 */
export function useMapCameraUrl() {
  const [camera, setCamera] = useQueryStates(mapCameraParsers, {
    limitUrlUpdates: throttle(CAMERA_WRITE_MS),
  });

  /*
   * Where a newly built map opens, read live from the URL rather than frozen at first render.
   *
   * `initialViewState` is consumed once, when mapbox is constructed, and ignored for the rest of
   * that map's life — so handing it the current value costs nothing while the visitor is driving.
   * Freezing it did cost something: Next keeps this route mounted after a visit (Activity), and the
   * map is torn down and rebuilt on the way back, so a frozen value reopened the view somebody left
   * days ago. Following "See on map" landed on that stale water and then flew to the boat from it.
   */
  const openingView =
    camera.zoom != null && camera.centre
      ? { longitude: camera.centre.lng, latitude: camera.centre.lat, zoom: camera.zoom }
      : undefined;

  return { openingView, hasCamera: openingView != null, setCamera };
}

// Written once the camera settles, so a reload — or a link sent to somebody — opens on the same
// water. Replaced rather than pushed, or every nudge of the map is a step of the back button.
export function useWriteCameraToUrl(
  map: MapInstance | null,
  setCamera: ReturnType<typeof useMapCameraUrl>["setCamera"],
) {
  useEffect(() => {
    if (!map) return;

    const write = () => {
      const centre = map.getCenter();
      void setCamera({
        zoom: Number(map.getZoom().toFixed(2)),
        centre: { lat: centre.lat, lng: centre.lng },
      });
    };

    map.on("moveend", write);
    return () => {
      map.off("moveend", write);
    };
  }, [map, setCamera]);
}
