/**
 * One-off catalogue sync, run by hand from the deployed container — `railway run`
 * or the dashboard shell, same env as the live server. Mirrors what
 * admin.provider.syncCatalogue kicks off, except it awaits the job instead of
 * firing it and returning, so the run's outcome prints before the process exits.
 *
 * A full NauSYS catalogue is a multi-hour walk (see services/provider-sync.ts in
 * packages/api) — expect this to take a while on a real account. `--provider <code>`
 * runs one vendor instead of every enabled one, which is what you want by hand:
 *
 *   pnpm --filter server sync:catalogue -- --provider booking_manager
 *
 * Unscoped, this imports from both vendors, so a Booking Manager run you expected to
 * take a minute drags a NauSYS walk along behind it.
 *
 * Unlike the admin procedure, this creates the provider row on first run rather
 * than requiring it to already exist — meant to also work against a database
 * that has never synced this provider before (an empty staging DB, say).
 *
 * The ingest itself doesn't expose per-company progress to its caller, and
 * closeRun only writes sync_run's counters once, at the very end. So this polls
 * provider_record and sync_error directly on an interval instead, the same way an
 * operator watching it live would: growth there means it's working, errors piling
 * up mean it's burning the run on retries.
 */
import { db } from "@yacht-charter/db";
import { startJob } from "./job";
import {
  createEnabledInventoryProviders,
  scopeToRequestedProvider,
  type InventoryProvider,
  type ProviderKey,
} from "@yacht-charter/providers";
import {
  type CatalogueSyncPhase,
  ensureProviderId,
  openCatalogueSyncRun,
  readCatalogueSyncProgress,
  runCatalogueSyncJob,
} from "@yacht-charter/providers/sync/runner";
import { readSyncCursor } from "@yacht-charter/providers/sync/cursor";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";

const job = startJob("sync-catalogue");

const PROGRESS_INTERVAL_MS = 30_000;

/*
 * Every enabled provider, not the one PROVIDER_MODE names. That variable selects
 * who we transact through, which is a different question from who we import from,
 * and reading it here meant a deployment could only ever sync one vendor.
 *
 * `--provider <code>` narrows it to one, for the by-hand runs where importing the
 * other vendor as well is a multi-hour accident.
 *
 * Sequential on purpose. The providers do not contend for anything (each has its
 * own credential, lane and sync_run lock), but a multi-hour NauSYS walk running
 * beside a Booking Manager one would interleave their progress lines into
 * something no operator can read.
 */
let providers: Map<ProviderKey, InventoryProvider>;
try {
  providers = scopeToRequestedProvider(
    await createEnabledInventoryProviders({ db }),
    process.argv.slice(2),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  await db.$client.end();
  await job.failed(error instanceof Error ? error.message : "could not resolve providers");
  process.exit(1);
}

if (providers.size === 0) {
  console.error("No enabled provider rows; nothing to sync");
  await db.$client.end();
  await job.failed("no enabled provider rows");
  process.exit(1);
}

let failed = 0;
let skipped = 0;

for (const provider of providers.values()) {
  const providerId = await ensureProviderId(db, provider.key);
  const resume = await readSyncCursor(db, { providerId, kind: "catalogue", scope: "full" });

  let syncRunId: string;
  try {
    syncRunId = await openCatalogueSyncRun(db, providerId);
  } catch (error) {
    /*
     * A live run really is walking this provider: since `openSyncRun` reaps a lock whose
     * owner stopped beating, this is no longer how a stranded row looks. It is the previous
     * tick overrunning, which for a multi-hour catalogue walk on a daily schedule is
     * ordinary. Counted apart from failures so the container does not exit non-zero and
     * report itself Crashed for doing the right thing.
     */
    skipped += 1;
    console.warn(`Skipped "${provider.key}": ${error instanceof Error ? error.message : error}`);
    continue;
  }

  console.log(`Started catalogue sync ${syncRunId} for provider "${provider.key}"`);
  const startedAt = Date.now();
  let phase: CatalogueSyncPhase = "ingest";

  const logProgress = async () => {
    const progress = await readCatalogueSyncProgress(db, providerId, syncRunId);
    const elapsedS = Math.round((Date.now() - startedAt) / 1000);
    const errors = `sync_error this run: ${progress.syncErrorTotal}`;

    /*
     * Only the ingest phase writes provider_record, so its counters are meaningless
     * afterwards - and printing a decaying rate beside a frozen count reads as a
     * stall rather than as a phase that does not touch that table.
     */
    if (phase !== "ingest") {
      console.log(`[${provider.key} ${elapsedS}s] phase: ${phase} | ${errors}`);
      return;
    }

    const seen = progress.recordsSeenThisRun;
    const rate = elapsedS > 0 ? (seen / elapsedS).toFixed(1) : "0.0";
    // Companies only once the walk reaches them; before that the cursor is still in
    // the global dumps and a "0/1309" would read as no progress rather than none yet.
    const companies =
      progress.companyIndex === null
        ? "companies -"
        : `companies ${progress.companyIndex}/${progress.companyTotal}`;

    console.log(
      `[${provider.key} ${elapsedS}s] phase: ingest | seen this run: ${seen} (${rate}/s) | ${companies} | provider_record total: ${progress.providerRecordTotal} | ${errors}`,
    );
  };

  const progressTimer = setInterval(() => void logProgress(), PROGRESS_INTERVAL_MS);

  try {
    const result = await runCatalogueSyncJob({
      db,
      provider,
      providerId,
      syncRunId,
      resume,
      cursorScope: "full",
      onPhase: (next) => {
        phase = next;
        console.log(`[${provider.key}] phase: ${next}`);
      },
    });
    console.log(JSON.stringify(result, null, 2));
    console.log(`Catalogue sync ${syncRunId} finished for "${provider.key}"`);
    if (result.status === "failed") failed += 1;
  } catch (error) {
    // One vendor being down must not cost the other its nightly import.
    failed += 1;
    console.error(`Catalogue sync failed for "${provider.key}":`, error);
  } finally {
    clearInterval(progressTimer);
  }
}

// Once, after every provider: the cache is shared, so dropping it per provider
// would only refill it from a catalogue still mid-import.
await revalidateCatalogCache();

// An idle pool client holds the event loop open. Harmless when a person runs this
// and walks away, fatal on a schedule: Railway reads a container that never exits
// as a run still in progress and skips every tick behind it.
await db.$client.end();

if (skipped > 0) console.warn(`${skipped} provider(s) skipped: a sync of theirs is still running`);

const metrics = { providers: providers.size, failed, skipped };
if (failed > 0) {
  await job.failed(`${failed} provider sync(s) failed`, metrics);
  process.exit(1);
}

await job.done(metrics);
