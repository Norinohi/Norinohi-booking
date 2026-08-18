/**
 * One-off catalogue sync, run by hand from the deployed container — `railway run`
 * or the dashboard shell, same env as the live server. Mirrors what
 * admin.provider.syncCatalogue kicks off, except it awaits the job instead of
 * firing it and returning, so the run's outcome prints before the process exits.
 *
 * A full NauSYS catalogue is a multi-hour walk (see services/provider-sync.ts in
 * packages/api) — expect this to take a while on a real account.
 *
 * Unlike the admin procedure, this creates the provider row on first run rather
 * than requiring it to already exist — meant to also work against a database
 * that has never synced this provider before (an empty staging DB, say).
 *
 * The ingest itself doesn't expose per-company progress to its caller — it's
 * strictly sequential (the vendor forbids parallel calls) and closeRun only
 * writes sync_run's counters once, at the very end. So this polls provider_record
 * and sync_error directly on an interval instead, the same way an operator
 * watching it live would: growth there means it's working, errors piling up mean
 * it's burning the run on retries.
 */
import { db } from "@yacht-charter/db";
import { createEnabledInventoryProviders } from "@yacht-charter/providers";
import {
  ensureProviderId,
  openCatalogueSyncRun,
  readCatalogueSyncProgress,
  runCatalogueSyncJob,
} from "@yacht-charter/providers/sync/runner";
import { readSyncCursor } from "@yacht-charter/providers/sync/cursor";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";

const PROGRESS_INTERVAL_MS = 30_000;

/*
 * Every enabled provider, not the one PROVIDER_MODE names. That variable selects
 * who we transact through, which is a different question from who we import from,
 * and reading it here meant a deployment could only ever sync one vendor.
 *
 * Sequential on purpose. The providers do not contend for anything (each has its
 * own credential, lane and sync_run lock), but a multi-hour NauSYS walk running
 * beside a Booking Manager one would interleave their progress lines into
 * something no operator can read.
 */
const providers = await createEnabledInventoryProviders({ db });

if (providers.size === 0) {
  console.error("No enabled provider rows; nothing to sync");
  await db.$client.end();
  process.exit(1);
}

let failed = 0;

for (const provider of providers.values()) {
  const providerId = await ensureProviderId(db, provider.key);
  const resume = await readSyncCursor(db, { providerId, kind: "catalogue", scope: "full" });

  let syncRunId: string;
  try {
    syncRunId = await openCatalogueSyncRun(db, providerId);
  } catch (error) {
    // A run already in flight is the expected collision when a previous tick is
    // still walking, not a reason to fail the others.
    failed += 1;
    console.error(`Skipped "${provider.key}": ${error instanceof Error ? error.message : error}`);
    continue;
  }

  console.log(`Started catalogue sync ${syncRunId} for provider "${provider.key}"`);
  const startedAt = Date.now();

  const logProgress = async () => {
    const progress = await readCatalogueSyncProgress(db, providerId, syncRunId);
    const elapsedS = Math.round((Date.now() - startedAt) / 1000);
    console.log(
      `[${provider.key} ${elapsedS}s] provider_record total: ${progress.providerRecordTotal} | sync_error this run: ${progress.syncErrorTotal}`,
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

if (failed > 0) process.exit(1);
