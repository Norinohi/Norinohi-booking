import { orpc } from "@/utils/orpc";

import type { AuditAction, AuditSource } from "../types";

/*
 * Isomorphic query option factories - used by both the server prefetch helpers
 * (api/server.ts) and the client hooks (hooks/), so cache keys never drift.
 * staleTime keeps the server-prefetched snapshot alive across hydration instead of
 * refetching on mount; mutations invalidate the router-segment key explicitly.
 */

export const AUDIT_PAGE_SIZE = 20;

/*
 * The admin audit trail. Every staff mutation writes one row and nothing edits them, so a page
 * only goes stale when a colleague acts — short staleTime, same as the queues.
 */
export const auditListQueryOptions = (input: {
  entityType?: string;
  entityId?: string;
  action?: AuditAction;
  source?: AuditSource;
  page: number;
  pageSize?: number;
}) =>
  orpc.admin.audit.list.queryOptions({
    input: { ...input, pageSize: input.pageSize ?? AUDIT_PAGE_SIZE },
    staleTime: 15_000,
  });
