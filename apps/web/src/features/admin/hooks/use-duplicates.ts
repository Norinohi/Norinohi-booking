"use client";

import { ORPCError } from "@orpc/client";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { duplicateDetailQueryOptions, duplicateQueueQueryOptions } from "../api/queries";
import type { DuplicateConfidenceFilter, DuplicateDecision } from "../types";

/*
 * Hooks over the admin duplicate-review procedures. Both verdicts invalidate the whole
 * `admin.match` segment, so every decision tab reflects a resolution at once.
 */

export function useDuplicateQueue(input: {
  decision: DuplicateDecision;
  confidence: DuplicateConfidenceFilter;
  matchedOn?: string;
  page: number;
}) {
  /*
   * The filters read their options out of this query's `summary`, so a filter change that
   * emptied `data` would unmount the band a reviewer had just picked; Base UI's Select then
   * reverts to a value its popup can still see and the selection appears not to take.
   */
  return useQuery({ ...duplicateQueueQueryOptions(input), placeholderData: keepPreviousData });
}

/** Callers mount this only once a pair is opened, which is what keeps the queue cheap. */
export function useDuplicateDetail(candidateId: string) {
  return useQuery(duplicateDetailQueryOptions(candidateId));
}

/**
 * A candidate someone else already resolved comes back as CONFLICT. That is not a failure
 * worth showing as one: the queue is simply out of date, so callers refetch and say so.
 */
export function isResolvedElsewhere(error: Error): boolean {
  return error instanceof ORPCError && error.code === "CONFLICT";
}

export function useConfirmDuplicate() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.match.confirm.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.match.key() }),
    }),
  );
}

export function useRejectDuplicate() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.match.reject.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.match.key() }),
    }),
  );
}

/**
 * Takes a verdict back: the pair returns to the queue as pending, without its note.
 *
 * Guarded on the server rather than here — a confirmation whose merge still stands comes back
 * CONFLICT, because the offers have to be split out before the pair is a question again.
 */
export function useReopenDuplicate() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.match.reopen.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.match.key() }),
    }),
  );
}

/** "I looked and I cannot tell" — a third verdict, kept out of the precision denominator. */
export function useDeferDuplicate() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.match.defer.mutationOptions({
      onSettled: () => queryClient.invalidateQueries({ queryKey: orpc.admin.match.key() }),
    }),
  );
}
