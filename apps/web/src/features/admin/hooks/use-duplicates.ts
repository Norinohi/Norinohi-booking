"use client";

import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import { duplicateQueueQueryOptions } from "../api/queries";
import type { DuplicateDecision } from "../types";

/*
 * Hooks over the admin duplicate-review procedures. Both verdicts invalidate the whole
 * `admin.match` segment, so every decision tab reflects a resolution at once.
 */

export function useDuplicateQueue(input: { decision: DuplicateDecision; page: number }) {
  return useQuery(duplicateQueueQueryOptions(input));
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
