"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

import {
  providerCapabilitiesQueryOptions,
  syncRunStatusQueryOptions,
  syncRunsQueryOptions,
} from "../api/queries";
import type { ProviderKey, SyncRunKind, SyncRunState } from "../types";

/* Hooks over the admin provider-sync procedures — the run history, and starting a run by hand. */

export function useSyncRuns(input: {
  provider?: ProviderKey;
  kind?: SyncRunKind;
  status?: SyncRunState;
  page: number;
}) {
  return useQuery(syncRunsQueryOptions(input));
}

/** One run's errors. Only called from an expanded row, so it never runs speculatively. */
export function useSyncRunStatus(syncRunId: string, provider: ProviderKey) {
  return useQuery(syncRunStatusQueryOptions({ syncRunId, provider }));
}

/** What the active connector supports. Read once; the answer is compiled in, not stored. */
export function useProviderCapabilities() {
  return useQuery(providerCapabilitiesQueryOptions());
}

/**
 * Starts a catalogue or availability run by hand. The cron routes normally do this; staff need
 * it when a provider was down at the scheduled hour, or after a mapping fix.
 *
 * The call returns as soon as the runs are opened — a full catalogue import outlives the request
 * by hours — so the only thing to do on success is refetch the history the run now appears in.
 */
export function useStartSync(kind: "catalogue" | "availability") {
  const queryClient = useQueryClient();
  const procedure =
    kind === "catalogue" ? orpc.admin.provider.syncCatalogue : orpc.admin.provider.syncAvailability;

  return useMutation(
    procedure.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: orpc.admin.provider.syncRuns.key() }),
    }),
  );
}
