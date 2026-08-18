import { orpc } from "@/utils/orpc";

import type {
  BookingStatus,
  DuplicateDecision,
  EnquiryStatus,
  InvoiceStatus,
  LeadKind,
  LeadStatus,
  ProviderKey,
  SyncRunKind,
  SyncRunState,
} from "../types";

/*
 * Isomorphic query option factories — used by both the server prefetch helpers
 * (api/server.ts) and the client hooks (hooks/), so cache keys never drift.
 * staleTime keeps the server-prefetched snapshot alive across hydration instead of
 * refetching on mount; mutations invalidate the router-segment key explicitly.
 */

export const DUPLICATES_PAGE_SIZE = 20;
export const INBOX_PAGE_SIZE = 20;
export const SYNC_RUNS_PAGE_SIZE = 20;
export const PAYMENTS_PAGE_SIZE = 20;

/** The bookings whose money is owed back — the refund tab's entire filter. */
export const REFUND_QUEUE_STATUSES: readonly BookingStatus[] = ["REFUND_PENDING"];

/* page/decision stay explicit so each filter combination keeps its own cache key. */
export const duplicateQueueQueryOptions = (input: {
  decision: DuplicateDecision;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.match.queue.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? DUPLICATES_PAGE_SIZE },
    staleTime: 30_000,
  });

/*
 * The staff inbox reads two unrelated queues side by side: questions about existing bookings
 * (booking_enquiry) and pre-booking enquiries (lead). Both are worked through by hand, so both
 * go stale as soon as a colleague touches one — hence the short staleTime.
 */
export const enquiryListQueryOptions = (input: {
  status?: EnquiryStatus;
  query?: string;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.enquiry.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? INBOX_PAGE_SIZE },
    staleTime: 15_000,
  });

export const leadListQueryOptions = (input: {
  status?: LeadStatus;
  kind?: LeadKind;
  query?: string;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.lead.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? INBOX_PAGE_SIZE },
    staleTime: 15_000,
  });

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
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.booking.list.queryOptions({
    input: {
      ...input,
      status: input.status ? [...input.status] : undefined,
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
 * What the active connector can actually do. Fixed for the life of a deployment — it is
 * compiled into the adapter, not stored — so this is read once and kept.
 */
export const providerCapabilitiesQueryOptions = () =>
  orpc.admin.provider.capabilities.queryOptions({ staleTime: Number.POSITIVE_INFINITY });

export const syncRunsQueryOptions = (input: {
  provider?: ProviderKey;
  kind?: SyncRunKind;
  status?: SyncRunState;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.provider.syncRuns.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? SYNC_RUNS_PAGE_SIZE },
    /* A run that is still running changes under us, so this list goes stale fast. */
    staleTime: 10_000,
  });

/**
 * One run's errors, behind the expandable row. `provider` is required because the
 * procedure otherwise answers for whichever connector PROVIDER_MODE names, which is
 * not necessarily the one that owns this run.
 */
export const syncRunStatusQueryOptions = (input: { syncRunId: string; provider: ProviderKey }) =>
  orpc.admin.provider.syncStatus.queryOptions({ input, staleTime: 10_000 });
