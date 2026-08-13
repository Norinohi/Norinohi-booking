"use client";

import { useQuery } from "@tanstack/react-query";

import { syncRunStatusQueryOptions, syncRunsQueryOptions } from "../api/queries";
import type { ProviderKey, SyncRunKind, SyncRunState } from "../types";

/* Hooks over the admin provider-sync procedures. Read-only: runs are started by the cron. */

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
