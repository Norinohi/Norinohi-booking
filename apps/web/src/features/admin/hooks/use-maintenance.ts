"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

/*
 * The scheduled jobs, run by hand. Both are idempotent, so neither needs a confirmation step —
 * the cost of a stray click is one wasted query.
 */

/**
 * Expires stale quotes and provider holds. Invalidates the sync history because the same sweep
 * fails runs whose process stopped beating, which is what the history was showing as in-flight.
 */
export function useSweepExpiries() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.maintenance.sweepExpiries.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: orpc.admin.provider.syncRuns.key() }),
    }),
  );
}

/** Mails the balance reminders due in the next ten days. Each installment is only ever sent once. */
export function useSendPaymentReminders() {
  return useMutation(orpc.admin.maintenance.sendPaymentReminders.mutationOptions());
}
