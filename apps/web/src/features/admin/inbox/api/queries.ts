import { orpc } from "@/utils/orpc";

import type { EnquiryStatus, LeadKind, LeadStatus } from "../types";

/*
 * Isomorphic query option factories - used by both the server prefetch helpers
 * (api/server.ts) and the client hooks (hooks/), so cache keys never drift.
 * staleTime keeps the server-prefetched snapshot alive across hydration instead of
 * refetching on mount; mutations invalidate the router-segment key explicitly.
 */

export const INBOX_PAGE_SIZE = 20;

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
 * Mutation option factories and the router-segment keys the hooks invalidate after them. Which
 * segments a write invalidates, and whether on success or on settle, is decided in the hooks.
 */

export const enquiryKey = () => orpc.admin.enquiry.key();
export const answerEnquiryMutationOptions = () => orpc.admin.enquiry.answer.mutationOptions();
export const setEnquiryStatusMutationOptions = () => orpc.admin.enquiry.setStatus.mutationOptions();

export const leadKey = () => orpc.admin.lead.key();
export const answerLeadMutationOptions = () => orpc.admin.lead.answer.mutationOptions();
export const setLeadStatusMutationOptions = () => orpc.admin.lead.setStatus.mutationOptions();
