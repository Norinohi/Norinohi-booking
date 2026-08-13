import { type syncKind, syncRun } from "@yacht-charter/db/schema/provider";

import type { Database } from "../registry";

/*
 * Opening a run lives here rather than in `runner.ts` because the availability
 * writer needs it too, and `runner.ts` reads the server env at module scope. One
 * import of it pulls env validation into every consumer, which is a lot of
 * coupling to buy for a single insert.
 */

export type SyncKind = (typeof syncKind.enumValues)[number];

/**
 * Raised when a run of the same provider and kind is already pending or running.
 *
 * Deliberately not a `ProviderError`: nothing went wrong with the vendor, so this
 * must not reach `sync_error` or a retry. It is a scheduling collision, and the
 * caller's job is to report it rather than start a second walk.
 */
export class SyncAlreadyRunningError extends Error {
  readonly providerId: string;
  readonly kind: SyncKind;

  constructor(providerId: string, kind: SyncKind) {
    super(`A ${kind} sync is already in flight for provider ${providerId}`);
    this.name = "SyncAlreadyRunningError";
    this.providerId = providerId;
    this.kind = kind;
  }
}

/**
 * Opens a run, or refuses because `sync_run_in_flight_uq` says one is live.
 *
 * The constraint is the lock. Before it, the nightly cron and an operator
 * pressing the admin button minutes later both started a full walk over the same
 * records and the same cursor row.
 */
export async function openSyncRun(
  db: Database,
  providerId: string,
  kind: SyncKind,
): Promise<string> {
  const [row] = await db
    .insert(syncRun)
    .values({ providerId, kind, status: "pending" })
    .onConflictDoNothing()
    .returning({ id: syncRun.id });

  if (!row) {
    throw new SyncAlreadyRunningError(providerId, kind);
  }
  return row.id;
}
