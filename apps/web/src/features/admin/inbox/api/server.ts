import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import { enquiryListQueryOptions } from "./queries";

/** Server prefetch for /inbox — the first page of open booking questions. */
export function prefetchInbox(queryClient: QueryClient) {
  return queryClient.prefetchQuery(enquiryListQueryOptions({ status: "open", page: 1 }));
}
