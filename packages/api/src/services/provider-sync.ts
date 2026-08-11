import { ORPCError } from "@orpc/server";
import { syncError, syncRun } from "@yacht-charter/db/schema/provider";
import type { InventoryProvider } from "@yacht-charter/providers";
import {
  HOT_WINDOW_CURSOR_SCOPE,
  openAvailabilitySyncRun,
  runAvailabilitySyncJob,
} from "@yacht-charter/providers/sync/availability-writer";
import { readSyncCursor } from "@yacht-charter/providers/sync/cursor";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";
import {
  openCatalogueSyncRun,
  resolveProviderId,
  runCatalogueSyncJob,
} from "@yacht-charter/providers/sync/runner";
import { desc, eq } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type { syncRunStatusSchema, syncRunStartedSchema } from "../contracts/admin";

type SyncRunStatus = z.infer<typeof syncRunStatusSchema>;
type SyncRunStarted = z.infer<typeof syncRunStartedSchema>;

const CURSOR_SCOPE = "full";

/**
 * Starts a catalogue sync and returns as soon as the run row exists.
 *
 * A full NauSYS catalogue is a multi-hour sequential walk; both callers (the cron
 * route and the admin procedure) sit behind an HTTP timeout that would kill it long
 * before it finished. Progress is observed through `sync_run` and `sync_error`
 * instead, which is also the only view an operator gets of the nightly run.
 */
export async function startCatalogueSync(
  db: Database,
  provider: InventoryProvider,
): Promise<SyncRunStarted> {
  const providerId = await resolveProviderId(db, provider.key);
  const syncRunId = await openCatalogueSyncRun(db, providerId);
  const resume = await readSyncCursor(db, {
    providerId,
    kind: "catalogue",
    scope: CURSOR_SCOPE,
  });

  // Deliberately not awaited. A failure inside the job is already recorded on the
  // run and its errors, so the only thing left to do here is not crash the process.
  //
  // The cache drop rides on the job's completion rather than this request: the
  // catalog has not moved until the run finishes, and revalidating early would
  // refill the cache from the state we are about to replace.
  void runCatalogueSyncJob({
    db,
    provider,
    providerId,
    syncRunId,
    resume,
    cursorScope: CURSOR_SCOPE,
  })
    .then(() => revalidateCatalogCache())
    .catch(() => undefined);

  return { syncRunId, status: "pending", provider: provider.key };
}

/**
 * Starts an availability sync and returns as soon as the run row exists.
 *
 * Same shape as the catalogue sync and for the same reason, but on a much shorter
 * cycle: the vendor asks for occupancy hourly, and the accurate `freeYachtsSearch`
 * pass is cut off by its own wall-clock budget rather than by this request.
 */
export async function startAvailabilitySync(
  db: Database,
  provider: InventoryProvider,
): Promise<SyncRunStarted> {
  const providerId = await resolveProviderId(db, provider.key);
  const syncRunId = await openAvailabilitySyncRun(db, providerId);
  // Only the hot-window pass is resumable; the occupancy pass is cheap enough to
  // redo from the top.
  const resume = await readSyncCursor(db, {
    providerId,
    kind: "availability",
    scope: HOT_WINDOW_CURSOR_SCOPE,
  });

  // Availability feeds the search cards' price and date window, both of which sit
  // in the cached catalog tier, so this run invalidates it too.
  void runAvailabilitySyncJob({ db, provider, providerId, syncRunId, resume })
    .then(() => revalidateCatalogCache())
    .catch(() => undefined);

  return { syncRunId, status: "pending", provider: provider.key };
}

export async function getCatalogueSyncStatus(
  db: Database,
  provider: InventoryProvider,
  input: { syncRunId?: string; errorLimit?: number } = {},
): Promise<SyncRunStatus> {
  const providerId = await resolveProviderId(db, provider.key);

  const [run] = await db
    .select()
    .from(syncRun)
    .where(input.syncRunId ? eq(syncRun.id, input.syncRunId) : eq(syncRun.providerId, providerId))
    .orderBy(desc(syncRun.createdAt))
    .limit(1);

  if (!run) {
    throw new ORPCError("NOT_FOUND", { message: "No catalogue sync run found" });
  }

  const errors = await db
    .select({
      id: syncError.id,
      errorType: syncError.errorType,
      message: syncError.message,
      createdAt: syncError.createdAt,
    })
    .from(syncError)
    .where(eq(syncError.syncRunId, run.id))
    .orderBy(desc(syncError.createdAt))
    .limit(input.errorLimit ?? 20);

  return {
    syncRunId: run.id,
    provider: provider.key,
    kind: run.kind,
    status: run.status,
    createdCount: run.createdCount,
    updatedCount: run.updatedCount,
    skippedCount: run.skippedCount,
    failedCount: run.failedCount,
    startedAt: run.startedAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
    errors: errors.map((item) => ({
      id: item.id,
      errorType: item.errorType,
      message: item.message,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}
