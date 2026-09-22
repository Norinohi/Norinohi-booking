interface QuoteRoute {
  startBaseId?: string;
  endBaseId?: string;
}

/**
 * The base pair a reprice asks the provider for.
 *
 * Either end distinguishes "not mentioned" from "cleared". Omitted keeps what the quote was
 * priced on, so changing guests does not silently turn a one-way into a return; null is the
 * control being switched back and has to survive the `??` that carries values forward.
 *
 * The start is carried as well as the drop-off because a drop-off alone matches the round trip
 * from another base as well as the one-way from this one, and the provider ranks the round trip
 * first: the customer asked where to finish and was moved to a pickup they never chose.
 */
export function repriceRoute(
  existing: { route: QuoteRoute | null },
  changes: { startBaseId?: string | null; endBaseId?: string | null },
): QuoteRoute {
  const route: QuoteRoute = {};
  const startBaseId =
    changes.startBaseId === undefined
      ? existing.route?.startBaseId
      : (changes.startBaseId ?? undefined);
  const endBaseId =
    changes.endBaseId === undefined ? existing.route?.endBaseId : (changes.endBaseId ?? undefined);
  if (startBaseId) route.startBaseId = startBaseId;
  if (endBaseId) route.endBaseId = endBaseId;
  return route;
}
