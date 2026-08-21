"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import {
  bookingDetailQueryOptions,
  bookingQueueQueryOptions,
  invoiceListQueryOptions,
} from "../api/queries";
import type { BookingStatus, InvoiceStatus } from "../types";

/*
 * Hooks over the two payment queues.
 *
 * Every write here crosses both segments: settling an invoice confirms its booking, and a
 * provider that then refuses moves that booking straight into the refund queue. So each
 * mutation invalidates the invoice *and* the booking key rather than its own — the tab the
 * colleague is not looking at is exactly the one that just went stale.
 */

function useInvalidateQueues() {
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: orpc.admin.invoice.key() }),
      queryClient.invalidateQueries({ queryKey: orpc.admin.booking.key() }),
    ]);
}

export function useInvoices(input: { status?: InvoiceStatus; page: number }) {
  return useQuery(invoiceListQueryOptions(input));
}

export function useBookingQueue(input: {
  status?: readonly BookingStatus[];
  query?: string;
  includeExcluded?: boolean;
  page: number;
}) {
  /* Kept across a page or filter change so the table does not blank out between fetches;
     the queues do without it because they are short and rarely paged. */
  return useQuery({ ...bookingQueueQueryOptions(input), placeholderData: keepPreviousData });
}

export function useAdminBooking(id: string) {
  return useQuery(bookingDetailQueryOptions({ id }));
}

export function useSettleInvoice() {
  const invalidate = useInvalidateQueues();
  return useMutation(orpc.admin.invoice.settle.mutationOptions({ onSettled: invalidate }));
}

export function useCancelInvoice() {
  const invalidate = useInvalidateQueues();
  return useMutation(orpc.admin.invoice.cancel.mutationOptions({ onSettled: invalidate }));
}

/**
 * Marks a booking as not real business, or restores it.
 *
 * Invalidates both queues like every other write here: an excluded booking leaves
 * the refund queue and the money it carried leaves the totals, so the tab the
 * colleague is not looking at is the one that just went stale.
 */
export function useSetBookingExcluded() {
  const invalidate = useInvalidateQueues();
  return useMutation(orpc.admin.booking.setExcluded.mutationOptions({ onSettled: invalidate }));
}

export function useRefundBooking() {
  const invalidate = useInvalidateQueues();
  return useMutation(orpc.admin.booking.refund.mutationOptions({ onSettled: invalidate }));
}

export function useCancelBooking() {
  const invalidate = useInvalidateQueues();
  return useMutation(orpc.admin.booking.cancel.mutationOptions({ onSettled: invalidate }));
}
