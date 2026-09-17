import type { MapInstance } from "./map-canvas";

export type Padding = { top: number; right: number; bottom: number; left: number };

/**
 * How much of the map's edges the panels over it have claimed.
 *
 * `getPadding` always answers with all four sides, but types them as optional, and both callers
 * do arithmetic on the numbers - so the filling in happens once, here, rather than at every use.
 */
export function paddingOf(map: MapInstance): Padding {
  const { top = 0, right = 0, bottom = 0, left = 0 } = map.getPadding();
  return { top, right, bottom, left };
}

export function samePadding(a: Padding, b: Padding): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}
