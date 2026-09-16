import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import { auditListQueryOptions } from "./queries";

/** Server prefetch for /audit — the first page of the unfiltered trail. */
export function prefetchAuditLog(queryClient: QueryClient) {
  return queryClient.prefetchQuery(auditListQueryOptions({ page: 1 }));
}
