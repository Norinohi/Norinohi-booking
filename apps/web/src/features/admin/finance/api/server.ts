import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import { commissionListQueryOptions } from "./queries";

/** Server prefetch for /commissions — the first page of rates, unfiltered. */
export function prefetchCommissions(queryClient: QueryClient) {
  return queryClient.prefetchQuery(commissionListQueryOptions({ page: 1 }));
}
