"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

/**
 * Slots a vendor refused to take back.
 *
 * Read on the sync screen rather than the bookings one: our own row already calls these
 * cancelled, and the question here is what the vendor still holds against us, which is a fact
 * about the connection rather than about the booking.
 */
export function useUnreleasedOptions() {
  return useQuery(orpc.admin.maintenance.unreleasedOptions.queryOptions({ input: {} }));
}

/** Asks the vendor again for one of them, and re-reads the list with whatever it answered. */
export function useRetryRelease() {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.admin.maintenance.retryRelease.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: orpc.admin.maintenance.unreleasedOptions.key(),
        }),
    }),
  );
}
