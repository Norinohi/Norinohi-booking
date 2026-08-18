"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { auditListQueryOptions } from "../api/queries";
import type { AuditAction } from "../types";

/** The admin trail, newest first. Read-only by construction: nothing edits an audit row. */
export function useAuditLog(input: {
  entityType?: string;
  entityId?: string;
  action?: AuditAction;
  page: number;
}) {
  return useQuery({ ...auditListQueryOptions(input), placeholderData: keepPreviousData });
}
