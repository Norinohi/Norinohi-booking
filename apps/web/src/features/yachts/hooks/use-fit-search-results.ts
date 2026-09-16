"use client";

import { useEffect, useRef } from "react";

import { paddingOf } from "@/components/shared/map/camera";
import { boundsOf, type Coordinates } from "@/components/shared/map/geometry";
import type { MapInstance } from "@/components/shared/map/map-canvas";
import { MAP_MARINA_ZOOM } from "@/lib/mapbox";

import { CLUSTER_FLIGHT_MS } from "../lib/map-flights";

/**
 * Fit each new search once; panning and background refetches keep the visitor's camera.
 *
 * `searchKey` names the search, `places` is its answer once it has one, and `arrivedWithView` says
 * the URL already chose where to look - a camera, or a boat to fly to - so the first fit of a visit
 * leaves it alone.
 */
export function useFitSearchResults(
  map: MapInstance | null,
  searchKey: string,
  places: Coordinates[] | undefined,
  arrivedWithView: boolean,
) {
  const framedSearch = useRef<{
    map: MapInstance;
    key: string;
    done: boolean;
    preserve: boolean;
  } | null>(null);

  useEffect(() => {
    if (!map) return;
    const previous = framedSearch.current;
    const newVisit = previous?.map !== map;
    if (newVisit || previous.key !== searchKey) {
      framedSearch.current = {
        map,
        key: searchKey,
        done: false,
        preserve: newVisit && arrivedWithView,
      };
    }
    const frame = framedSearch.current;
    if (!frame || frame.done || !places) return;
    frame.done = true;
    if (frame.preserve || places.length === 0) return;
    map.fitBounds(boundsOf(places), {
      padding: paddingOf(map),
      maxZoom: MAP_MARINA_ZOOM,
      duration: newVisit ? 0 : CLUSTER_FLIGHT_MS,
    });
  }, [map, places, searchKey, arrivedWithView]);
}
