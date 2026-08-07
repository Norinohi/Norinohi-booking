import { orpc } from "@/utils/orpc";

/*
 * Isomorphic query option factories for the home page — used by both the server prefetch
 * helper (api/server.ts) and the client section hooks, so cache keys never drift.
 */
export const popularYachtsQueryOptions = () =>
  orpc.charterSearch.results.queryOptions({
    input: { sort: "rating", pageSize: 5, currency: "EUR" },
  });
