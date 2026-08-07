"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { referralHistoryQueryOptions, referralSummaryQueryOptions } from "../api/queries";

/** Share code, stat tiles and loyalty progress — server-prefetched, so it hydrates warm. */
export function useReferralSummary() {
  return useQuery(referralSummaryQueryOptions());
}

/** Who accepted the code and what it paid out, newest first. */
export function useReferralHistory(page = 1) {
  return useQuery(referralHistoryQueryOptions(page));
}

/**
 * Issues a fresh code. Links already shared stop resolving, so the summary has
 * to be refetched rather than patched — the server decides the new code.
 */
export function useRotateReferralCode() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.referral.rotateCode.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.referral.summary.key() }),
    }),
  );
}
