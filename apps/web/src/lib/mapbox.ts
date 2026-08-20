import { env } from "@yacht-charter/env/web";

/* Classic, not Standard: the Static Images API renders no Standard style, and the stills have to
   match the live maps they open. */
export const MAP_STYLE_ID = "mapbox/satellite-streets-v12";
export const MAP_STYLE_URL = `mapbox://styles/${MAP_STYLE_ID}`;

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

const MAX_ZOOM = 18;

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

export type StaticMapFrame = {
  url: string;
  /** Each point's place on the still, in percent, ready for `left`/`top`. */
  markers: { leftPercent: number; topPercent: number }[];
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
          spanX > 0 ? Math.log2(usableWidth / (TILE_SIZE * spanX)) : MAX_ZOOM,
          spanY > 0 ? Math.log2(usableHeight / (TILE_SIZE * spanY)) : MAX_ZOOM,
          MAX_ZOOM,
        )
      : SINGLE_POINT_ZOOM;

  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  const worldSize = TILE_SIZE * 2 ** zoom;

  return {
    url: `${BASE}/${unprojectX(centreX)},${unprojectY(centreY)},${zoom}/${width}x${height}@2x?access_token=${env.NEXT_PUBLIC_MAPBOX_TOKEN}`,
    markers: points.map((point, index) => ({
      leftPercent: (((xs[index] ?? centreX) - centreX) * worldSize + width / 2) / (width / 100),
      topPercent: (((ys[index] ?? centreY) - centreY) * worldSize + height / 2) / (height / 100),
    })),
  };
}
