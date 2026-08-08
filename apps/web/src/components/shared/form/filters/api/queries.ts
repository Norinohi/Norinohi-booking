import { orpc } from "@/utils/orpc";

/**
 * Filter facets. Cached server-side on the `days` tier (features/*​/api/server.ts), so the client
 * is told the same thing: re-fetching a taxonomy the server is holding for a day only undoes the
 * saving. Hydrated entries carry the cache-fill timestamp, so a shorter `staleTime` here would
 * make every first paint trigger a background refetch. See docs/adr/0002.
 */
const ONE_DAY = 24 * 60 * 60 * 1000;

export const facetsQueryOptions = () =>
  orpc.charterSearch.facets.queryOptions({ input: {}, staleTime: ONE_DAY });
