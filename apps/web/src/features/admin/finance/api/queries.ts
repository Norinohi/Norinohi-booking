import { orpc } from "@/utils/orpc";

import type { ProviderKey } from "../../shared/types";
import type { CommissionStatus } from "../types";

/*
 * Isomorphic query option factories - used by both the server prefetch helpers
 * (api/server.ts) and the client hooks (hooks/), so cache keys never drift.
 * staleTime keeps the server-prefetched snapshot alive across hydration instead of
 * refetching on mount; mutations invalidate the router-segment key explicitly.
 */

export const COMMISSIONS_PAGE_SIZE = 20;

/*
 * The commission rates staff have entered. Short staleTime for the reason the other staff
 * queues have one: two people can be editing the same agreements, and a rate a colleague has
 * just switched off must not stay listed as active here.
 */
export const commissionListQueryOptions = (input: {
  provider?: ProviderKey;
  status?: CommissionStatus;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.commission.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? COMMISSIONS_PAGE_SIZE },
    staleTime: 15_000,
  });

/*
 * What the providers report. Longer staleTime than the agreements beside it: nothing here is
 * edited, the figures move only when a sweep runs, and the tab is paged through rather than
 * acted on.
 */
export const reportedCommissionListQueryOptions = (input: {
  provider?: ProviderKey;
  query?: string;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.commission.reported.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? COMMISSIONS_PAGE_SIZE },
    staleTime: 60_000,
  });

/*
 * Mutation option factories and the router-segment keys the hooks invalidate after them. Which
 * segments a write invalidates, and whether on success or on settle, is decided in the hooks.
 */

export const commissionKey = () => orpc.admin.commission.key();
export const createCommissionMutationOptions = () => orpc.admin.commission.create.mutationOptions();
export const updateCommissionMutationOptions = () => orpc.admin.commission.update.mutationOptions();
export const setCommissionActiveMutationOptions = () =>
  orpc.admin.commission.setActive.mutationOptions();
