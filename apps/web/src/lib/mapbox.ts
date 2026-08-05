import { env } from "@yacht-charter/env/web";

export const MAP_STYLE_ID = "testaccfor123098/cmsg01i3v00hn01sf5hecb7kb";
export const MAP_STYLE_URL = `mapbox://styles/${MAP_STYLE_ID}`;

type Point = { lat: number; lng: number };

const BASE = `https://api.mapbox.com/styles/v1/${MAP_STYLE_ID}/static`;

export function staticMapUrl(
  point: Point,
  { zoom = 13, size = "480x320@2x" }: { zoom?: number; size?: string } = {},
): string {
  return `${BASE}/${point.lng},${point.lat},${zoom}/${size}?access_token=${env.NEXT_PUBLIC_MAPBOX_TOKEN}`;
}
