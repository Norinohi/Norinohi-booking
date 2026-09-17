import { boundsOf, type Coordinates } from "@/components/shared/map/geometry";
import type { MapInstance } from "@/components/shared/map/map-canvas";
import { MAP_MARINA_ZOOM } from "@/lib/mapbox";

/*
 * How long a descent takes, per zoom level it has to cross.
 *
 * A fixed number cannot serve it. The 800ms that reads as deliberate over the two or three levels a
 * splitting cluster moves is a snap over the six or seven between a coastline view and a berth, and
 * the duration that suits the six drags over the two. Matching the rate instead — near enough the
 * rate the splitting flight runs at — keeps every camera move on this screen feeling like the same
 * hand, whatever zoom it started from.
 */
const DESCENT_MS_PER_ZOOM = 210;

/* Bounds on it: a press from almost on top of a marina should still move rather than cut, and a
   descent from the far end of the range should not become a tour. Mapbox's own pacing, which is
   what this replaced, ran past four seconds on the longest of them. */
const DESCENT_MIN_MS = 400;
const DESCENT_MAX_MS = 1600;

/*
 * How far the cluster fit is pulled back once the boats are framed.
 *
 * A fit puts the outermost of them exactly on that margin, which on a spread cluster reads as two
 * markers pinned to opposite edges — on screen, and easy to miss entirely. Half a zoom level shows
 * about a third more water each way, which is what makes the group read as a group.
 */
const CLUSTER_FIT_EASE = 0.5;

/*
 * How long the camera takes to open a cluster.
 *
 * Longer than mapbox's 500ms default because this flight is the biggest one the map makes — several
 * zoom levels at once — and at the default pace the boats have replaced the pill before the eye has
 * registered that anything moved.
 */
export const CLUSTER_FLIGHT_MS = 800;

export type Descent = { focusZoom: number; focusDurationMs: number };

/**
 * The descent to a place the visitor has named: down to the marina, timed by how far it has to come.
 *
 * Nothing when the camera is already there or closer — pressing a marina from further in must not
 * pull the view back out — which is also the ordinary case for "See on map" now that the link
 * carries its own camera: there is no flight to make, only the card to slide in.
 */
export function descentTo(map: MapInstance): Descent | null {
  const levels = MAP_MARINA_ZOOM - map.getZoom();
  if (levels <= 0) return null;

  return {
    focusZoom: MAP_MARINA_ZOOM,
    focusDurationMs: Math.min(
      Math.max(levels * DESCENT_MS_PER_ZOOM, DESCENT_MIN_MS),
      DESCENT_MAX_MS,
    ),
  };
}

/**
 * Frames the boats a cluster holds, eased back so the group reads as a group.
 *
 * `expansionZoom` is the zoom that actually breaks the cluster apart, and `ceiling` the most the
 * map allows.
 */
export function flyIntoCluster(
  map: MapInstance,
  leaves: Coordinates[],
  expansionZoom: number,
  ceiling: number,
) {
  /* Asked for rather than flown, so the zoom can be eased off before the camera commits. No
     padding of its own: without one mapbox falls back to the map's, which already describes the
     panels and the margin. */
  const bounds = boundsOf(leaves);
  const camera = map.cameraForBounds(bounds, { maxZoom: ceiling });

  if (camera?.zoom == null) {
    map.fitBounds(bounds, { maxZoom: ceiling, duration: CLUSTER_FLIGHT_MS });
    return;
  }

  map.easeTo({
    ...camera,
    /* Never eased below the zoom that actually breaks the cluster apart, or backing off would
       land on the same pill the visitor just pressed. */
    zoom: Math.min(Math.max(camera.zoom - CLUSTER_FIT_EASE, expansionZoom), ceiling),
    duration: CLUSTER_FLIGHT_MS,
  });
}
