"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { enquiryListQueryOptions, leadListQueryOptions } from "../api/queries";
import type { EnquiryStatus, LeadKind, LeadStatus } from "../types";

/*
 * Hooks over the two staff queues. Every write invalidates its whole router segment rather
 * than one page: answering a question moves it between the status filters, so the tab the
 * colleague is not looking at has to be stale too.
 */

export function useEnquiries(input: { status?: EnquiryStatus; query?: string; page: number }) {
  return useQuery(enquiryListQueryOptions(input));
}

export function useLeads(input: {
  status?: LeadStatus;
  kind?: LeadKind;
  query?: string;
  page: number;
}) {
  return useQuery(leadListQueryOptions(input));
}

export function useAnswerEnquiry() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.enquiry.answer.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.enquiry.key() }),
    }),
  );
}

export function useSetEnquiryStatus() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.enquiry.setStatus.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.enquiry.key() }),
    }),
  );
}

export function useAnswerLead() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.lead.answer.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.lead.key() }),
    }),
  );
}

export function useSetLeadStatus() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.lead.setStatus.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.lead.key() }),
    }),
  );
}
