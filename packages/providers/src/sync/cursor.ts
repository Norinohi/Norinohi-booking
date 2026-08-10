import { syncCursor } from "@yacht-charter/db/schema/provider";
import { and, eq } from "drizzle-orm";

import type { Database } from "../registry";

export type SyncCursorKind = (typeof syncCursor.kind)["enumValues"][number];

export interface SyncCursorKey {
  providerId: string;
  kind: SyncCursorKind;
  /** Distinguishes several cursors of one kind, e.g. a hot-window sweep. */
  scope: string;
}

/**
 * No vendor exposes a resume token, so the cursor value is entirely ours. It is
 * stored JSON-encoded in a text column: the shape differs per provider and per
 * sync kind, and the reader is the only party that knows how to interpret it.
 */
export async function readSyncCursor(db: Database, key: SyncCursorKey): Promise<unknown> {
  const [row] = await db
    .select({ cursor: syncCursor.cursor })
    .from(syncCursor)
    .where(
      and(
        eq(syncCursor.providerId, key.providerId),
        eq(syncCursor.kind, key.kind),
        eq(syncCursor.scope, key.scope),
      ),
    )
    .limit(1);

  if (!row?.cursor) return null;

  try {
    return JSON.parse(row.cursor);
  } catch {
    // A cursor we cannot read is a resume we must not attempt: restarting from
    // zero is always correct, restarting from a misread position is not.
    return null;
  }
}

export async function writeSyncCursor(
  db: Database,
  key: SyncCursorKey,
  value: unknown,
): Promise<void> {
  const encoded = value === null || value === undefined ? null : JSON.stringify(value);

  await db
    .insert(syncCursor)
    .values({
      providerId: key.providerId,
      kind: key.kind,
      scope: key.scope,
      cursor: encoded,
    })
    .onConflictDoUpdate({
      target: [syncCursor.providerId, syncCursor.kind, syncCursor.scope],
      set: { cursor: encoded, updatedAt: new Date() },
    });
}

/** Called after a run finishes its stream, so the next one starts from the top. */
export function clearSyncCursor(db: Database, key: SyncCursorKey): Promise<void> {
  return writeSyncCursor(db, key, null);
}
