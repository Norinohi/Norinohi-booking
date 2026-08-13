import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import { duplicateQueueQueryOptions, syncRunsQueryOptions } from "./queries";

/** Server prefetch for /duplicates — the first page of the pending queue. */
export function prefetchDuplicateQueue(queryClient: QueryClient) {
  return queryClient.prefetchQuery(duplicateQueueQueryOptions({ decision: "pending", page: 1 }));
}

/** Server prefetch for /sync — the first page of the unfiltered run history. */
export function prefetchSyncRuns(queryClient: QueryClient) {
  return queryClient.prefetchQuery(syncRunsQueryOptions({ page: 1 }));
}
