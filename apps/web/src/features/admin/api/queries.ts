import { orpc } from "@/utils/orpc";

import type {
  DuplicateDecision,
  EnquiryStatus,
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
