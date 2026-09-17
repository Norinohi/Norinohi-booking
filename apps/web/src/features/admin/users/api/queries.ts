import { orpc } from "@/utils/orpc";

import type { UserAccountStatus, UserAdminSort, UserRole } from "../types";

/*
 * Isomorphic query option factories - used by both the server prefetch helpers
 * (api/server.ts) and the client hooks (hooks/), so cache keys never drift.
 * staleTime keeps the server-prefetched snapshot alive across hydration instead of
 * refetching on mount; mutations invalidate the router-segment key explicitly.
 */

export const USERS_PAGE_SIZE = 20;

export const userListQueryOptions = (input: {
  query?: string;
  role?: UserRole;
  status?: UserAccountStatus;
  hasBookings?: boolean;
  sort?: UserAdminSort;
  page: number;
}) =>
  orpc.admin.user.list.queryOptions({
    input: { ...input, sort: input.sort ?? "newest", pageSize: USERS_PAGE_SIZE },
    staleTime: 15_000,
  });
