import { orpc } from "@/utils/orpc";

import type { BookingStatus, InvoiceStatus } from "../types";

/*
 * Isomorphic query option factories - used by both the server prefetch helpers
 * (api/server.ts) and the client hooks (hooks/), so cache keys never drift.
 * staleTime keeps the server-prefetched snapshot alive across hydration instead of
 * refetching on mount; mutations invalidate the router-segment key explicitly.
 */

export const PAYMENTS_PAGE_SIZE = 20;
export const BOOKINGS_PAGE_SIZE = 20;

/** The bookings whose money is owed back — the refund tab's entire filter. */
export const REFUND_QUEUE_STATUSES: readonly BookingStatus[] = ["REFUND_PENDING"];

/*
 * The two staff payment queues. Both are worked by hand and both move a booking when they are,
 * so a colleague acting on one makes the other's snapshot wrong — hence the short staleTime that
 * the inbox queues use for the same reason.
 */
export const invoiceListQueryOptions = (input: {
  status?: InvoiceStatus;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.invoice.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? PAYMENTS_PAGE_SIZE },
    staleTime: 15_000,
  });

export const bookingQueueQueryOptions = (input: {
  status?: readonly BookingStatus[];
  query?: string;
  /** Bring back the bookings someone marked as not real business; off unless asked for. */
  includeExcluded?: boolean;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.booking.list.queryOptions({
    input: {
      ...input,
      status: input.status ? [...input.status] : undefined,
      includeExcluded: input.includeExcluded ?? false,
      pageSize: input.pageSize ?? PAYMENTS_PAGE_SIZE,
    },
    staleTime: 15_000,
  });

/**
 * One booking for staff. Longer staleTime than the queues: a detail screen is opened to read,
 * and the actions on it invalidate the whole booking segment anyway.
 */
export const bookingDetailQueryOptions = (input: { id: string }) =>
  orpc.admin.booking.get.queryOptions({ input, staleTime: 30_000 });

/*
 * Mutation option factories and the router-segment keys the hooks invalidate after them. Which
 * segments a write invalidates, and whether on success or on settle, is decided in the hooks.
 */

export const invoiceKey = () => orpc.admin.invoice.key();
export const settleInvoiceMutationOptions = () => orpc.admin.invoice.settle.mutationOptions();
export const cancelInvoiceMutationOptions = () => orpc.admin.invoice.cancel.mutationOptions();

export const adminBookingKey = () => orpc.admin.booking.key();
export const setBookingExcludedMutationOptions = () =>
  orpc.admin.booking.setExcluded.mutationOptions();
export const refundBookingMutationOptions = () => orpc.admin.booking.refund.mutationOptions();
export const cancelAdminBookingMutationOptions = () => orpc.admin.booking.cancel.mutationOptions();
