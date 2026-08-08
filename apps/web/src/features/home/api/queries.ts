import { orpc } from "@/utils/orpc";

/*
 * Isomorphic query option factories for the home page — used by both the server prefetch
 * helper (api/server.ts) and the client section hooks, so cache keys never drift.
 */

/** Single-sourced so the cached server read and the client hook resolve to the same key. */
export const POPULAR_YACHTS_INPUT = { sort: "rating", pageSize: 5, currency: "EUR" } as const;

/** Matches the `hours` tier this is cached on server-side, so hydration does not refetch. */
const ONE_HOUR = 60 * 60 * 1000;

export const popularYachtsQueryOptions = () =>
  orpc.charterSearch.results.queryOptions({ input: POPULAR_YACHTS_INPUT, staleTime: ONE_HOUR });
