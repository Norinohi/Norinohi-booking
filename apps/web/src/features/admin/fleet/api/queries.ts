import { orpc } from "@/utils/orpc";

import type { ProviderKey } from "../../shared/types";
import type {
  DuplicateConfidenceFilter,
  DuplicateDecision,
  ListingStatus,
  SyncRunKind,
  SyncRunState,
} from "../types";

/*
 * Isomorphic query option factories - used by both the server prefetch helpers
 * (api/server.ts) and the client hooks (hooks/), so cache keys never drift.
 * staleTime keeps the server-prefetched snapshot alive across hydration instead of
 * refetching on mount; mutations invalidate the router-segment key explicitly.
 */

export const DUPLICATES_PAGE_SIZE = 20;
export const SYNC_RUNS_PAGE_SIZE = 20;
export const LISTINGS_PAGE_SIZE = 20;

/*
 * The band the queue opens on. Pairs scored 90% and up are the ones a reviewer can settle at a
 * glance, and they are a third of the proposals, so starting there is the difference between a
 * queue that gets worked and one that gets scrolled. Read by the screen's initial state as well
 * as the fallback below, so the server prefetch and the first client render share a cache key.
 */
export const DUPLICATES_DEFAULT_CONFIDENCE: DuplicateConfidenceFilter = "high";

/* Every filter stays explicit so each combination keeps its own cache key, and so the
   server prefetch and the client's first render agree on it down to the last field. */
export const duplicateQueueQueryOptions = (input: {
  decision: DuplicateDecision;
  confidence?: DuplicateConfidenceFilter;
  matchedOn?: string;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.match.queue.queryOptions({
    input: {
      decision: input.decision,
      confidence: input.confidence ?? DUPLICATES_DEFAULT_CONFIDENCE,
      matchedOn: input.matchedOn,
      page: input.page,
      pageSize: input.pageSize ?? DUPLICATES_PAGE_SIZE,
    },
    staleTime: 30_000,
  });

/*
 * The pair's photos and full specs, fetched only once a reviewer opens one — 20 pairs'
 * worth of galleries is not something the queue should pay for. Cached longer than the
 * queue because a synced listing's specs do not move while the tab is open.
 */
export const duplicateDetailQueryOptions = (candidateId: string, locale: string) =>
  orpc.admin.match.detail.queryOptions({ input: { candidateId, locale }, staleTime: 300_000 });

/*
 * Precision per rule and band. Cached longer than the queue because it only moves as pairs are
 * reviewed, and it still refreshes on a verdict: the mutations invalidate the whole
 * `admin.match` segment, which is right here — a decision is exactly what changes these rates.
 */
export const duplicateMetricsQueryOptions = () =>
  orpc.admin.match.metrics.queryOptions({ input: {}, staleTime: 300_000 });

/*
 * The catalogue as staff see it, drafts included. Short staleTime for the same reason the
 * queues have one: this is a review screen two people work at once, and a row a colleague
 * has just published must not stay listed as a draft here.
 */
export const listingAdminListQueryOptions = (input: {
  provider?: ProviderKey;
  operatorId?: string;
  status?: ListingStatus;
  query?: string;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.listing.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? LISTINGS_PAGE_SIZE },
    staleTime: 15_000,
  });

/*
 * What the active connector can actually do. Fixed for the life of a deployment — it is
 * compiled into the adapter, not stored — so this is read once and kept.
 */
export const providerCapabilitiesQueryOptions = () =>
  orpc.admin.provider.capabilities.queryOptions({ staleTime: Number.POSITIVE_INFINITY });

/*
 * How each vendor has been answering, over a window the reader picks. Cached for a minute: it
 * is an aggregate over every quote of the last month, and one more attempt cannot move it.
 */
export const providerReliabilityQueryOptions = (windowDays: number) =>
  orpc.admin.provider.reliability.queryOptions({ input: { windowDays }, staleTime: 60_000 });

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

/*
 * Mutation option factories and the router-segment keys the hooks invalidate after them. Which
 * segments a write invalidates, and whether on success or on settle, is decided in the hooks.
 */

export const duplicateKey = () => orpc.admin.match.key();
export const confirmDuplicateMutationOptions = () => orpc.admin.match.confirm.mutationOptions();
export const rejectDuplicateMutationOptions = () => orpc.admin.match.reject.mutationOptions();
export const reopenDuplicateMutationOptions = () => orpc.admin.match.reopen.mutationOptions();
export const deferDuplicateMutationOptions = () => orpc.admin.match.defer.mutationOptions();
export const splitListingOfferMutationOptions = () => orpc.admin.match.split.mutationOptions();

export const listingKey = () => orpc.admin.listing.key();
export const listingFieldSourcesQueryOptions = (listingId: string) =>
  orpc.admin.listing.fieldSources.queryOptions({ input: { listingId } });
export const setListingStatusMutationOptions = () => orpc.admin.listing.setStatus.mutationOptions();
export const publishDraftsMutationOptions = () =>
  orpc.admin.listing.publishDrafts.mutationOptions();
export const setListingFieldSourceMutationOptions = () =>
  orpc.admin.listing.setFieldSource.mutationOptions();

export const syncRunsKey = () => orpc.admin.provider.syncRuns.key();
export const startSyncMutationOptions = (kind: "catalogue" | "availability") => {
  const procedure =
    kind === "catalogue" ? orpc.admin.provider.syncCatalogue : orpc.admin.provider.syncAvailability;
  return procedure.mutationOptions();
};

export const unreleasedOptionsKey = () => orpc.admin.maintenance.unreleasedOptions.key();
export const unreleasedOptionsQueryOptions = () =>
  orpc.admin.maintenance.unreleasedOptions.queryOptions({ input: {} });
export const sweepExpiriesMutationOptions = () =>
  orpc.admin.maintenance.sweepExpiries.mutationOptions();
export const sendPaymentRemindersMutationOptions = () =>
  orpc.admin.maintenance.sendPaymentReminders.mutationOptions();
export const retryReleaseMutationOptions = () =>
  orpc.admin.maintenance.retryRelease.mutationOptions();
