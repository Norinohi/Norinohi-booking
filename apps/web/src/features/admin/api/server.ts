import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import {
  auditListQueryOptions,
  bookingDetailQueryOptions,
  duplicateQueueQueryOptions,
  enquiryListQueryOptions,
  invoiceListQueryOptions,
  syncRunsQueryOptions,
} from "./queries";

/** Server prefetch for /duplicates — the first page of the pending queue. */
export function prefetchDuplicateQueue(queryClient: QueryClient) {
  return queryClient.prefetchQuery(duplicateQueueQueryOptions({ decision: "pending", page: 1 }));
}

/** Server prefetch for /inbox — the first page of open booking questions. */
export function prefetchInbox(queryClient: QueryClient) {
  return queryClient.prefetchQuery(enquiryListQueryOptions({ status: "open", page: 1 }));
}

/**
 * Server prefetch for /payments — the pending invoice requests, which is the tab that opens.
 * The refund queue is the other tab and is fetched when it is opened, not before.
 */
export function prefetchPayments(queryClient: QueryClient) {
  return queryClient.prefetchQuery(invoiceListQueryOptions({ status: "pending", page: 1 }));
}

/** Server prefetch for /staff/bookings/[id]. */
export function prefetchAdminBooking(queryClient: QueryClient, id: string) {
  return queryClient.prefetchQuery(bookingDetailQueryOptions({ id }));
}

/** Server prefetch for /audit — the first page of the unfiltered trail. */
export function prefetchAuditLog(queryClient: QueryClient) {
  return queryClient.prefetchQuery(auditListQueryOptions({ page: 1 }));
}

/** Server prefetch for /sync — the first page of the unfiltered run history. */
export function prefetchSyncRuns(queryClient: QueryClient) {
  return queryClient.prefetchQuery(syncRunsQueryOptions({ page: 1 }));
}
