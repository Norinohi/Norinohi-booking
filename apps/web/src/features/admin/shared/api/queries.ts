import { orpc } from "@/utils/orpc";

import type { ProviderKey } from "../types";

/*
 * Isomorphic query option factories - used by both the server prefetch helpers
 * (api/server.ts) and the client hooks (hooks/), so cache keys never drift.
 * staleTime keeps the server-prefetched snapshot alive across hydration instead of
 * refetching on mount; mutations invalidate the router-segment key explicitly.
 */

/* The rate form's operator picker. Operators are written by the catalogue sync and effectively
   fixed between runs, so a search result keeps for a minute. */
export const commissionOperatorOptionsQueryOptions = (query: string, provider?: ProviderKey) =>
  orpc.admin.commission.operatorOptions.queryOptions({
    input: { query: query || undefined, provider },
    staleTime: 60_000,
  });
