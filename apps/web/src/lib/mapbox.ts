import { env } from "@yacht-charter/env/web";

/* Classic, not Standard: the Static Images API renders no Standard style, and the stills have to
   match the live maps they open. */
export const MAP_STYLE_ID = "mapbox/satellite-streets-v12";
export const MAP_STYLE_URL = `mapbox://styles/${MAP_STYLE_ID}`;

/* The street map a dialog can switch to. Stills stay satellite: only the live maps offer the
   choice, and a still is a picture of the map that opens by default. */
export const MAP_STYLE_STREETS_URL = "mapbox://styles/mapbox/streets-v12";

type Point = { lat: number; lng: number };

const BASE = `https://api.mapbox.com/styles/v1/${MAP_STYLE_ID}/static`;

export function staticMapUrl(
  point: Point,
  { zoom = 13, size = "480x320@2x" }: { zoom?: number; size?: string } = {},
): string {
  return `${BASE}/${point.lng},${point.lat},${zoom}/${size}?access_token=${env.NEXT_PUBLIC_MAPBOX_TOKEN}`;
}

/** Mapbox styles are served in 512px tiles, which is what a zoom level means in pixels. */
const TILE_SIZE = 512;

/** Keeps a marker sitting on the outermost stop inside the frame rather than half off it. */
const FRAME_PADDING = 56;

/** A lone stop has no span to fit, so the frame falls back to a street-level view of it. */
const SINGLE_POINT_ZOOM = 12;

/**
 * The range every live map runs in, and the ceiling a still is framed to.
 *
 * Here rather than in `MapCanvas` because pages that only *link* to a map need the ceiling too, and
 * importing it from the canvas would pull mapbox-gl into their bundle.
 *
 * The floor is where one world still fills a wide container, so no zoom lets a second copy of the
 * Adriatic — and a second set of its markers — be panned into frame. The ceiling is about a berth:
 * past it the satellite tiles run out and the reward for going closer is blurred water.
 */
export const MAP_MIN_ZOOM = 3;
export const MAP_MAX_ZOOM = 18;

/**
 * Where the camera comes to rest when it is sent to one marina — a boat pressed on the map, a
 * cluster that turns out to be a single berth, or a "See on map" link.
 *
 * Short of the ceiling on purpose. Boats sharing a marina lie on one coordinate and no zoom will
 * separate them, so the last two levels buy nothing and cost the coastline that says *where* the
 * marina is. The ceiling stays where it is: somebody who wants to count pontoons still can.
 */
export const MAP_MARINA_ZOOM = 16;

/** Web Mercator, normalised to the unit square: x and y both run 0 to 1 across the world. */
const projectX = (lng: number) => (lng + 180) / 360;

const projectY = (lat: number) => {
  const radians = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
};

const unprojectX = (x: number) => x * 360 - 180;

const unprojectY = (y: number) => {
  const n = Math.PI * (1 - 2 * y);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
};

export type StillPosition = { leftPercent: number; topPercent: number };

export type StaticMapFrame = {
  url: string;
  /** Each point's place on the still, in percent, ready for `left`/`top`. */
  markers: StillPosition[];
  /** The same maths for any other coordinate, so a route can be drawn over the still. */
  project: (point: Point) => StillPosition;
};

/**
 * A still framed around several places, plus where each of them lands on it.
 *
 * The frame is computed here rather than left to the API's `auto` because the marks have to go on
 * afterwards: `auto` picks a centre and a zoom it never reports, and without those two numbers
 * there is no way to say where a stop sits in the picture. Naming them means the caller can draw
 * the app's own markers over the still instead of the teardrop pins Mapbox bakes in — a custom
 * pin image would have to be fetched by Mapbox from a public URL, which a dev machine has not got.
 */
export function staticMapFrame(
  points: Point[],
  { width, height }: { width: number; height: number },
): StaticMapFrame {
  const xs = points.map((point) => projectX(point.lng));
  const ys = points.map((point) => projectY(point.lat));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const usableWidth = Math.max(width - FRAME_PADDING * 2, 1);
  const usableHeight = Math.max(height - FRAME_PADDING * 2, 1);

  const zoom =
    spanX > 0 || spanY > 0
      ? Math.min(
          spanX > 0 ? Math.log2(usableWidth / (TILE_SIZE * spanX)) : MAP_MAX_ZOOM,
          spanY > 0 ? Math.log2(usableHeight / (TILE_SIZE * spanY)) : MAP_MAX_ZOOM,
          MAP_MAX_ZOOM,
        )
      : SINGLE_POINT_ZOOM;

  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  const worldSize = TILE_SIZE * 2 ** zoom;

  const project = (point: Point): StillPosition => ({
    leftPercent: ((projectX(point.lng) - centreX) * worldSize + width / 2) / (width / 100),
    topPercent: ((projectY(point.lat) - centreY) * worldSize + height / 2) / (height / 100),
  });

  return {
    url: `${BASE}/${unprojectX(centreX)},${unprojectY(centreY)},${zoom}/${width}x${height}@2x?access_token=${env.NEXT_PUBLIC_MAPBOX_TOKEN}`,
    markers: points.map(project),
    project,
  };
}
