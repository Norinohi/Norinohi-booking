export type RouteStop = {
  day: number;
  title: string;
  description: string;
  lat: number;
  lng: number;
};

export type RoutePoint = {
  lat: number;
  lng: number;
  /** Every day that lands here, in order. A charter that returns to its base gives `[1, 7]`. */
  days: number[];
  stops: RouteStop[];
};

/**
 * The stops of an itinerary, grouped by the place they happen at.
 *
 * A charter starts and ends at the same marina, so two of its days share one coordinate — and two
 * markers stacked on that coordinate read as a rendering fault rather than as the round trip they
 * are. Grouped, the place carries both day numbers and says so.
 *
 * Coordinates are compared as given. They come from one source per listing, so the base is
 * literally the same pair of numbers on both days; rounding would only invent near-matches.
 */
export function routePoints(stops: RouteStop[]): RoutePoint[] {
  const byPlace = new Map<string, RoutePoint>();

  for (const stop of stops) {
    const key = `${stop.lat},${stop.lng}`;
    const point = byPlace.get(key);

    if (point) {
      point.days.push(stop.day);
      point.stops.push(stop);
      continue;
    }

    byPlace.set(key, { lat: stop.lat, lng: stop.lng, days: [stop.day], stops: [stop] });
  }

  return [...byPlace.values()];
}

/**
 * What a place is to the itinerary, where that is worth saying at all.
 *
 * Only the ends get named. The middle of a route is already spelled out day by day in the list
 * under the map, and numbering every marker there said the wrong thing anyway: a number in a
 * badge is what the search map uses for *how many boats are here*, so on a route it read as a
 * count rather than an order.
 */
export type RoutePointRole = "start" | "finish" | "start-finish";

export function routePointRole(point: RoutePoint, stops: RouteStop[]): RoutePointRole | null {
  const days = stops.map((stop) => stop.day);
  const first = Math.min(...days);
  const last = Math.max(...days);

  const isStart = point.days.includes(first);
  const isFinish = point.days.includes(last);

  if (isStart && isFinish) return "start-finish";
  if (isStart) return "start";
  if (isFinish) return "finish";
  return null;
}

/** Joined here so the still and the live map word a shared start-and-finish the same way. */
export function routeCaption(
  role: RoutePointRole,
  words: { start: string; finish: string },
): string {
  if (role === "start") return words.start;
  if (role === "finish") return words.finish;
  return `${words.start} · ${words.finish}`;
}
