import type { Quote } from "../api/queries";

export interface OneWayRoute {
  from: string | null;
  to: string | null;
}

/**
 * The quoted charter's route where it ends somewhere other than it starts, else null.
 *
 * Read off the route option the quote was priced on. A provider that lets the customer choose
 * shows its choice in the drop-off control; one that fixes the route (NauSYS, through the
 * yacht's own one-way periods) still has to say that the week finishes in another marina.
 */
export function oneWayRouteOf(
  quote: Pick<Quote, "route" | "routeOptions"> | null | undefined,
): OneWayRoute | null {
  const route = quote?.route;
  if (!quote || !route) return null;
  const priced = quote.routeOptions.find(
    (option) => option.startBaseId === route.startBaseId && option.endBaseId === route.endBaseId,
  );
  if (!priced?.isOneWay) return null;
  return { from: priced.startBaseName ?? null, to: priced.endBaseName ?? null };
}

/** "A → B, one-way", or the word alone where the marinas were never named. */
export function oneWayRouteLabel(route: OneWayRoute, oneWayWord: string): string {
  return route.from && route.to ? `${route.from} → ${route.to}, ${oneWayWord}` : oneWayWord;
}
