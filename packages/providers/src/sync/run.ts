import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { log, parseError } from "evlog";

import {
  IN_FLIGHT_SYNC_STATUSES,
  provider,
  STALE_SYNC_RUN_MS,
  syncError,
  type syncKind,
  syncRun,
} from "@yacht-charter/db/schema/provider";

import type { Database } from "../registry";
import { thrownFields } from "../shared/log-fields";

/*
 * Opening a run lives here rather than in `runner.ts` because the availability
 * writer needs it too, and `runner.ts` reads the server env at module scope. One
 * import of it pulls env validation into every consumer, which is a lot of
 * coupling to buy for a single insert.
 *
 * So does everything else about a run's *ownership* — the heartbeat that proves a
 * process is still there, the shutdown hook that closes the row when it is not, and
 * the reaper that takes the lock back when neither happened. They are one mechanism:
 * `sync_run_in_flight_uq` is a lock with no lease, and these three give it one.
 */

/**
 * The kinds a run can have. `reservations` is excluded on purpose: it shares the enum because
 * it shares the cursor table, but the reconciliation pass keeps a window marker and never opens
 * a run, so nothing here -- the lock, the reaper, the admin screens -- can ever meet one.
 */
export type SyncKind = Exclude<(typeof syncKind.enumValues)[number], "reservations">;

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
 *
 * A conflict is checked rather than believed. The incumbent may be a row a dead
 * process left behind, in which case waiting for the sweep to notice costs this tick
 * and every tick until it runs; taking the lock off a run that stopped beating and
 * retrying once means the schedule unblocks itself.
 */
export async function openSyncRun(
  db: Database,
  providerId: string,
  kind: SyncKind,
): Promise<string> {
  const opened = await attempt(db, providerId, kind);
  if (opened.id) return track(db, opened.id, providerId, kind);

  const reaped = await reapStaleSyncRuns(db, { providerId, kind: opened.heldBy });
  if (reaped.length === 0) throw new SyncAlreadyRunningError(providerId, opened.heldBy);

  /* Still refused means a live process took it between the reap and here, which is the
     collision the lock is for: report it rather than fight over it. */
  const retried = await attempt(db, providerId, kind);
  if (!retried.id) throw new SyncAlreadyRunningError(providerId, retried.heldBy);

  return track(db, retried.id, providerId, kind);
}

/** The insert, and which kind holds the ground when it is refused. */
async function attempt(
  db: Database,
  providerId: string,
  kind: SyncKind,
): Promise<{ id: string | null; heldBy: SyncKind }> {
  try {
    return { id: await insertSyncRun(db, providerId, kind), heldBy: kind };
  } catch (error) {
    if (error instanceof OtherKindInFlight) return { id: null, heldBy: error.kind };
    throw error;
  }
}

/**
 * The providers whose background calls may not overlap at all, and the kinds that make them.
 *
 * NauSYS forbids parallel requests on a credential, and its written exemption covers only live
 * booking calls. Measured on 2026-09-18, parallel `freeYachts` calls from this account were
 * answered `429 Too many concurrent requests for user` for all but one. The in-flight index
 * locks per kind, and the client's queue serializes only inside one process, so the nightly
 * catalogue walk (hours long) and the half-hourly availability run each held their own lock and
 * called the vendor side by side. Media cleanup never calls a vendor and is left out.
 */
const EXCLUSIVE_PROVIDER_CODES = new Set(["nausys"]);
const VENDOR_KINDS: readonly SyncKind[] = ["catalogue", "availability"];

type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Another vendor kind holds an exclusive provider; see `EXCLUSIVE_PROVIDER_CODES`. */
class OtherKindInFlight extends Error {
  constructor(readonly kind: SyncKind) {
    super(`A ${kind} run is in flight`);
  }
}

/**
 * The insert that takes the lock, with the cross-kind check where the provider needs it.
 *
 * For an exclusive provider the check and the insert share one transaction behind an advisory
 * lock on the provider, so two processes of different kinds cannot both see nothing and both
 * start: the second waits for the first to commit its row, then finds it.
 */
async function insertSyncRun(
  db: Database,
  providerId: string,
  kind: SyncKind,
): Promise<string | null> {
  if (!(await isExclusive(db, providerId, kind))) return plainInsert(db, providerId, kind);

  const others = VENDOR_KINDS.filter((other) => other !== kind);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`sync:${providerId}`}))`);
    const [live] = await tx
      .select({ kind: syncRun.kind })
      .from(syncRun)
      .where(
        and(
          eq(syncRun.providerId, providerId),
          inArray(syncRun.kind, [...others]),
          inArray(syncRun.status, [...IN_FLIGHT_SYNC_STATUSES]),
        ),
      )
      .limit(1);
    const liveKind = VENDOR_KINDS.find((candidate) => candidate === live?.kind);
    if (liveKind !== undefined) throw new OtherKindInFlight(liveKind);
    return plainInsert(tx, providerId, kind);
  });
}

async function isExclusive(db: Database, providerId: string, kind: SyncKind): Promise<boolean> {
  if (!VENDOR_KINDS.includes(kind)) return false;
  const [owner] = await db
    .select({ code: provider.code })
    .from(provider)
    .where(eq(provider.id, providerId))
    .limit(1);
  return owner !== undefined && EXCLUSIVE_PROVIDER_CODES.has(owner.code);
}

async function plainInsert(
  db: Executor,
  providerId: string,
  kind: SyncKind,
): Promise<string | null> {
  const [row] = await db
    .insert(syncRun)
    .values({ providerId, kind, status: "pending" })
    .onConflictDoNothing()
    .returning({ id: syncRun.id });

  return row?.id ?? null;
}

/**
 * Runs whose owner stopped beating, moved to `failed`.
 *
 * `pending` and `running` are only ever left behind by the process doing the work — it
 * writes the terminal status itself — so a redeploy, an OOM or a restart strands the row
 * with nobody to close it. That used to be untidy history. Since the in-flight unique
 * index it is a deadlock: the stranded row holds the lock for that provider and kind, and
 * every later sync is refused at the insert, quietly, for as long as the row sits there.
 *
 * The failure is recorded as a `transient` sync_error rather than only a status, because
 * a run that ends with no explanation is indistinguishable from one that failed on the
 * vendor's side, and the two want different responses from whoever reads the history.
 *
 * Called both by the expiry sweep, which reaps whatever it finds, and by `openSyncRun`
 * for the one provider and kind it wants. Narrow the filter, never the cutoff.
 */
export async function reapStaleSyncRuns(
  db: Database,
  options: { now?: Date; providerId?: string; kind?: SyncKind } = {},
): Promise<string[]> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - STALE_SYNC_RUN_MS);

  const scope = [
    // The index's own definition of in-flight, so the lock and its release agree.
    inArray(syncRun.status, [...IN_FLIGHT_SYNC_STATUSES]),
    lte(syncRun.heartbeatAt, cutoff),
    options.providerId === undefined ? undefined : eq(syncRun.providerId, options.providerId),
    options.kind === undefined ? undefined : eq(syncRun.kind, options.kind),
  ];

  const reaped = await db
    .update(syncRun)
    .set({ status: "failed", finishedAt: now })
    .where(and(...scope))
    .returning({ id: syncRun.id });

  if (reaped.length > 0) {
    await db.insert(syncError).values(
      reaped.map((row) => ({
        syncRunId: row.id,
        errorType: "transient" as const,
        message: "Abandoned mid-run: its process stopped sending a heartbeat",
        context: { reapedAt: now.toISOString(), cutoff: cutoff.toISOString() },
      })),
    );
  }

  return reaped.map((row) => row.id);
}

/* --------------------------------------------------------------- ownership */

/**
 * How often an owning process says it is still there.
 *
 * An order of magnitude under `STALE_SYNC_RUN_MS`, so a run has to miss ten beats before
 * anything is taken from it. Cheap enough to be unconditional: one narrow update against
 * a handful of rows, on a walk that is already writing thousands.
 */
const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * How long shutdown may spend closing runs before it gives up and exits anyway.
 *
 * Hosts allow a bounded grace period after SIGTERM and then send SIGKILL; overrunning it
 * buys nothing and loses the exit. Two writes against an unloaded connection are far
 * inside this, and the reaper is the backstop for the case where they are not.
 */
const SHUTDOWN_GRACE_MS = 5_000;

const SHUTDOWN_SIGNALS = ["SIGTERM", "SIGINT"] as const;
type ShutdownSignal = (typeof SHUTDOWN_SIGNALS)[number];

/** Exit is 128 + the signal number, the shell's convention for "killed by this signal". */
const SIGNAL_NUMBERS = { SIGTERM: 15, SIGINT: 2 } satisfies Record<ShutdownSignal, number>;

type OwnedRun = { db: Database; providerId: string; kind: SyncKind };

/** Runs this process opened and has not closed. Empty for a process holding no lock. */
const ownedRuns = new Map<string, OwnedRun>();
let heartbeat: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;

function track(db: Database, syncRunId: string, providerId: string, kind: SyncKind): string {
  ownedRuns.set(syncRunId, { db, providerId, kind });

  if (heartbeat === null) {
    heartbeat = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
    /* A scheduled entry point that never exits reads to the host as a run still in
       progress, and every tick behind it is skipped. This timer must never be why. */
    heartbeat.unref();
  }
  for (const signal of SHUTDOWN_SIGNALS) {
    if (!process.listeners(signal).includes(onShutdownSignal)) {
      process.on(signal, onShutdownSignal);
    }
  }

  return syncRunId;
}

/**
 * Gives up the lock on a run that now has a terminal status.
 *
 * Called by the stores after `closeRun`, so a process that finishes one provider and moves
 * to the next is not still promising to close a run that is already closed.
 */
export function releaseSyncRun(syncRunId: string): void {
  ownedRuns.delete(syncRunId);
  if (ownedRuns.size > 0) return;

  if (heartbeat !== null) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
  /* Handlers come off with the last run: a process holding no lock has nothing to close
     here, and leaving a listener installed would quietly override the default exit. */
  for (const signal of SHUTDOWN_SIGNALS) {
    process.off(signal, onShutdownSignal);
  }
}

async function beat(): Promise<void> {
  const now = new Date();

  for (const [db, ids] of groupByDatabase(ownedRuns)) {
    try {
      await db
        .update(syncRun)
        .set({ heartbeatAt: now })
        .where(
          and(inArray(syncRun.id, ids), inArray(syncRun.status, [...IN_FLIGHT_SYNC_STATUSES])),
        );
    } catch (error) {
      /* Bookkeeping must never be why a sync dies. A missed beat costs the run its lock at
         worst, and only after ten of them; the reaper closing it is the correct outcome. */
      log.error({ action: "sync_run.heartbeat_failed", ...thrownFields(parseError(error)) });
    }
  }
}

/* One statement per database rather than per run. In this process there is one of each. */
function groupByDatabase(runs: ReadonlyMap<string, OwnedRun>): Map<Database, string[]> {
  const byDatabase = new Map<Database, string[]>();

  for (const [syncRunId, run] of runs) {
    const ids = byDatabase.get(run.db);
    if (ids) ids.push(syncRunId);
    else byDatabase.set(run.db, [syncRunId]);
  }
  return byDatabase;
}

function onShutdownSignal(signal: ShutdownSignal): void {
  void closeOwnedRunsAndExit(signal);
}

/**
 * Closes every run this process still owns, then exits.
 *
 * The reaper alone would eventually free these, but a deploy is the common way a run dies
 * and it is the one case where the process is told first. Writing the terminal status here
 * turns a lock held until the next sweep into one released in the same second, and leaves
 * a run whose history says what happened to it rather than one that simply stops.
 *
 * Best effort, on purpose. A database that will not answer inside the grace period must not
 * cost us the exit as well, and the row it leaves is exactly what the reaper is for.
 */
async function closeOwnedRunsAndExit(signal: ShutdownSignal): Promise<never> {
  if (!shuttingDown) {
    shuttingDown = true;
    /* Taken before the map is cleared, so the grouping still knows which database each
       run belongs to; cleared so a second signal does not try to close them again. */
    const owned = groupByDatabase(ownedRuns);
    ownedRuns.clear();

    if (owned.size > 0) {
      await Promise.race([closeRuns(owned, signal), wait(SHUTDOWN_GRACE_MS)]);
    }
  }

  process.exit(128 + SIGNAL_NUMBERS[signal]);
}

async function closeRuns(owned: Map<Database, string[]>, signal: ShutdownSignal): Promise<void> {
  const now = new Date();

  for (const [db, ids] of owned) {
    try {
      await closeRunsOn(db, ids, signal, now);
    } catch (error) {
      /* The exit matters more than the tidy-up, and the reaper covers what is left behind. */
      log.error({
        action: "sync_run.shutdown_close_failed",
        signal,
        ...thrownFields(parseError(error)),
      });
    }
  }
}

async function closeRunsOn(
  db: Database,
  syncRunIds: string[],
  signal: ShutdownSignal,
  now: Date,
): Promise<void> {
  const closed = await db
    .update(syncRun)
    .set({ status: "failed", finishedAt: now })
    .where(
      and(inArray(syncRun.id, syncRunIds), inArray(syncRun.status, [...IN_FLIGHT_SYNC_STATUSES])),
    )
    .returning({ id: syncRun.id });

  if (closed.length === 0) return;

  await db.insert(syncError).values(
    closed.map((row) => ({
      syncRunId: row.id,
      errorType: "transient" as const,
      message: `Interrupted by ${signal}: the process was asked to stop mid-run`,
      context: { signal, closedAt: now.toISOString() },
    })),
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}
