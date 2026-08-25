import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import {
  auditListQueryOptions,
  faqListQueryOptions,
  BOOKINGS_PAGE_SIZE,
  bookingDetailQueryOptions,
  bookingQueueQueryOptions,
  duplicateQueueQueryOptions,
  enquiryListQueryOptions,
  invoiceListQueryOptions,
  listingAdminListQueryOptions,
  routeListQueryOptions,
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

/**
 * Server prefetch for /staff/bookings: the first page of every booking, unfiltered, which is
 * the state the table opens in.
 */
export function prefetchAdminBookings(queryClient: QueryClient) {
  return queryClient.prefetchQuery(
    bookingQueueQueryOptions({ page: 1, pageSize: BOOKINGS_PAGE_SIZE }),
  );
}

/** Server prefetch for /staff/bookings/[id]. */
export function prefetchAdminBooking(queryClient: QueryClient, id: string) {
  return queryClient.prefetchQuery(bookingDetailQueryOptions({ id }));
}

/** Server prefetch for /audit — the first page of the unfiltered trail. */
export function prefetchAuditLog(queryClient: QueryClient) {
  return queryClient.prefetchQuery(auditListQueryOptions({ page: 1 }));
}

/**
 * Server prefetch for /listings: the first page of the whole catalogue, unfiltered, which is
 * the state the table opens in.
 */
export function prefetchListings(queryClient: QueryClient) {
  return queryClient.prefetchQuery(listingAdminListQueryOptions({ page: 1 }));
}

/** Server prefetch for /sync — the first page of the unfiltered run history. */
export function prefetchSyncRuns(queryClient: QueryClient) {
  return queryClient.prefetchQuery(syncRunsQueryOptions({ page: 1 }));
}

/** Server prefetch for /routes — the first page of the whole route library, drafts included. */
export function prefetchRoutes(queryClient: QueryClient) {
  return queryClient.prefetchQuery(routeListQueryOptions({ page: 1 }));
}

/** Server prefetch for /faq — the site-wide list, every category, which is how the screen opens. */
export function prefetchFaq(queryClient: QueryClient) {
  return queryClient.prefetchQuery(faqListQueryOptions({ scope: "site", page: 1 }));
}
