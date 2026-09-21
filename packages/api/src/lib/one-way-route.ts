import type { QuoteRouteOption } from "@yacht-charter/db/schema/quote";

export interface OneWayRoute {
  from: string | null;
  to: string | null;
}

/**
 * The priced charter's route where it ends in another marina than it starts, else null.
 *
 * Read off the route option the quote was priced on, like the booking sidebar does, so the
 * booking page and the mails say what checkout said. Names are null where the provider sent
 * none; the charter is still one-way.
 */
export function oneWayRouteOf(priced: {
  route: { startBaseId?: string; endBaseId?: string } | null;
  routeOptions: readonly QuoteRouteOption[];
}): OneWayRoute | null {
  const route = priced.route;
  if (!route) return null;
  const option = priced.routeOptions.find(
    (candidate) =>
      candidate.startBaseId === route.startBaseId && candidate.endBaseId === route.endBaseId,
  );
  if (!option?.isOneWay) return null;
  return { from: option.startBaseName ?? null, to: option.endBaseName ?? null };
}

/** "A → B (one-way)", or just "One-way" where the marinas were never named. For mails. */
export function oneWayRouteText(route: OneWayRoute): string {
  return route.from && route.to ? `${route.from} → ${route.to} (one-way)` : "One-way";
}
