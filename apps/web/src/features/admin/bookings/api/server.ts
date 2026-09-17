import "server-only";

import type { QueryClient } from "@tanstack/react-query";

import {
  BOOKINGS_PAGE_SIZE,
  invoiceListQueryOptions,
  bookingQueueQueryOptions,
  bookingDetailQueryOptions,
} from "./queries";

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
export function prefetchAdminBooking(queryClient: QueryClient, id: string, locale: string) {
  return queryClient.prefetchQuery(bookingDetailQueryOptions({ id, locale }));
}
