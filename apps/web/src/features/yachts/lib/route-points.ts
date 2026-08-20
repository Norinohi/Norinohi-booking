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
 * The ends are named rather than numbered, because a bare numeral by a marker is what the search
 * map uses for *how many boats are here*.
 */
type RoutePointRole = "start" | "finish" | "start-finish";

function routePointRole(point: RoutePoint, stops: RouteStop[]): RoutePointRole | null {
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

export type RouteWords = {
  start: string;
  finish: string;
  /** Worded, never a bare number: a numeral by a marker reads as a count, not as an order. */
  day: (day: number) => string;
};

/** Worded here so the still and the live map label the same place the same way. */
export function routeCaption(point: RoutePoint, stops: RouteStop[], words: RouteWords): string {
  const role = routePointRole(point, stops);

  if (role === "start-finish") return `${words.start} · ${words.finish}`;
  if (role === "start") return words.start;
  if (role === "finish") return words.finish;
  return words.day(Math.min(...point.days));
}

/** How long the whole itinerary takes to draw. Shared so both maps run at one speed. */
export const ROUTE_DRAW_MS = 2400;

/** Dense enough that a leg reads as a curve rather than a chain of chords. */
const SAMPLES_PER_LEG = 24;

const placeKey = (point: { lat: number; lng: number }) => `${point.lat},${point.lng}`;

/** Catmull-Rom, which unlike a plain Bézier passes through its control points. */
function spline(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  );
}

export type RouteCurve = {
  /** The curve in order, ready to project onto a still or hand to a GeoJSON LineString. */
  points: { lat: number; lng: number }[];
  /** How far along the curve each place is first reached, 0–1, keyed as `routePoints` keys. */
  arrivals: Map<string, number>;
};

/**
 * The itinerary as one smooth curve, plus where each stop sits along it.
 *
 * Built from the stops in day order, not from `routePoints`: those are grouped by place, so a
 * charter that returns to its base would lose the leg home. `arrivals` is what lets a marker
 * appear exactly when the drawn line reaches it rather than on a guessed timer.
 */
export function routeCurve(stops: RouteStop[]): RouteCurve {
  const ordered = [...stops].sort((a, b) => a.day - b.day);
  if (ordered.length < 2) {
    return {
      points: ordered.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
      arrivals: new Map(),
    };
  }

  const at = (index: number) => ordered[Math.min(Math.max(index, 0), ordered.length - 1)];

  const points: { lat: number; lng: number }[] = [];
  /** Index into `points` where each leg starts, so a stop can be located along the curve. */
  const vertexAt: number[] = [];

  for (let leg = 0; leg < ordered.length - 1; leg++) {
    const [a, b, c, d] = [at(leg - 1), at(leg), at(leg + 1), at(leg + 2)];
    vertexAt.push(points.length);

    for (let step = 0; step < SAMPLES_PER_LEG; step++) {
      const t = step / SAMPLES_PER_LEG;
      points.push({
        lat: spline(a.lat, b.lat, c.lat, d.lat, t),
        lng: spline(a.lng, b.lng, c.lng, d.lng, t),
      });
    }
  }

  const last = at(ordered.length - 1);
  vertexAt.push(points.length);
  points.push({ lat: last.lat, lng: last.lng });

  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].lng - points[i - 1].lng;
    const dy = points[i].lat - points[i - 1].lat;
    lengths.push(lengths[i - 1] + Math.hypot(dx, dy));
  }
  const total = lengths[lengths.length - 1] || 1;

  const arrivals = new Map<string, number>();
  ordered.forEach((stop, index) => {
    const key = placeKey(stop);
    /* First arrival wins: a base that is both day 1 and day 7 is on screen from the start. */
    if (!arrivals.has(key)) arrivals.set(key, lengths[vertexAt[index]] / total);
  });

  return { points, arrivals };
}

/** Looks a place up in `arrivals`, which is keyed the same way `routePoints` groups. */
export function arrivalOf(curve: RouteCurve, point: { lat: number; lng: number }): number {
  return curve.arrivals.get(placeKey(point)) ?? 0;
}
