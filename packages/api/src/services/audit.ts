import { auditLog } from "@yacht-charter/db/schema/admin";
import { user } from "@yacht-charter/db/schema/auth";
import { and, count, desc, eq } from "drizzle-orm";
import type { z } from "zod";

import type { Database, DatabaseExecutor } from "../context";
import type { auditListInputSchema, auditListSchema } from "../contracts/admin";
import { paginatedQuery, totalFrom } from "./pagination";

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

type ListInput = z.infer<typeof auditListInputSchema>;
type ListResult = z.infer<typeof auditListSchema>;

/** The read side of the table above; nothing else in the app looks at it. */
export async function listAuditLog(db: Database, input: ListInput): Promise<ListResult> {
  const filters = [];
  if (input.entityType) filters.push(eq(auditLog.entityType, input.entityType));
  if (input.entityId) filters.push(eq(auditLog.entityId, input.entityId));
  if (input.action) filters.push(eq(auditLog.action, input.action));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const { rows, pagination } = await paginatedQuery({
    page: input.page,
    pageSize: input.pageSize,
    rows: (limit, offset) =>
      db
        .select({
          entry: auditLog,
          actorId: user.id,
          actorName: user.name,
          actorEmail: user.email,
        })
        .from(auditLog)
        .leftJoin(user, eq(user.id, auditLog.actorUserId))
        .where(where)
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(limit)
        .offset(offset),
    total: async () =>
      totalFrom(await db.select({ totalItems: count() }).from(auditLog).where(where)),
  });

  return {
    items: rows.map((row) => ({
      id: row.entry.id,
      action: row.entry.action,
      entityType: row.entry.entityType,
      entityId: row.entry.entityId,
      before: row.entry.before,
      after: row.entry.after,
      metadata: row.entry.metadata,
      createdAt: row.entry.createdAt.toISOString(),
      actor: row.actorId
        ? { id: row.actorId, name: row.actorName ?? null, email: row.actorEmail ?? null }
        : null,
    })),
    pagination,
  };
}
