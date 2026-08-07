import { auditLog } from "@yacht-charter/db/schema/admin";

import type { DatabaseExecutor } from "../context";

type AuditAction = "create" | "update" | "delete" | "sync" | "merge" | "price_adjustment";

export type AuditEntry = {
  actorUserId: string;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

/**
 * Every admin mutation writes one of these — see docs/backend-architecture.md §5.7.
 * Callers pass the same transaction they mutated in, so the log cannot survive a
 * rolled-back change (or go missing after a committed one).
 */
export async function writeAuditLog(db: DatabaseExecutor, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    metadata: entry.metadata ?? null,
  });
}
