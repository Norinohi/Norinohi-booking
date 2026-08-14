import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import { duplicateQueueQueryOptions, enquiryListQueryOptions, syncRunsQueryOptions } from "./queries";

/** Server prefetch for /duplicates — the first page of the pending queue. */
export function prefetchDuplicateQueue(queryClient: QueryClient) {
  return queryClient.prefetchQuery(duplicateQueueQueryOptions({ decision: "pending", page: 1 }));
}

/** Server prefetch for /inbox — the first page of open booking questions. */
export function prefetchInbox(queryClient: QueryClient) {
  return queryClient.prefetchQuery(enquiryListQueryOptions({ status: "open", page: 1 }));
}

/** Server prefetch for /sync — the first page of the unfiltered run history. */
export function prefetchSyncRuns(queryClient: QueryClient) {
  return queryClient.prefetchQuery(syncRunsQueryOptions({ page: 1 }));
}
