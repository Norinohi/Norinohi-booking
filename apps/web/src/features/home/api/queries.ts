import type { Locale } from "@/i18n/config";
import { orpc } from "@/utils/orpc";

/*
 * Isomorphic query option factories for the home page — used by both the server prefetch
 * helper (api/server.ts) and the client section hooks, so cache keys never drift.
 */

/**
 * Single-sourced so the cached server read and the client hook resolve to the same key.
 *
 * A function rather than a constant since the cards became localized: the server translates a
 * card's category, country, region and the rest off `locale`, and the two sides have to build the
 * same input or hydration seeds a key the browser never reads.
 */
export const popularYachtsInput = (locale: Locale) =>
  ({ sort: "rating", pageSize: 5, currency: "EUR", locale }) as const;

/** Matches the `hours` tier this is cached on server-side, so hydration does not refetch. */
const ONE_HOUR = 60 * 60 * 1000;

export const popularYachtsQueryOptions = (locale: Locale) =>
  orpc.charterSearch.results.queryOptions({
    input: popularYachtsInput(locale),
    staleTime: ONE_HOUR,
  });
