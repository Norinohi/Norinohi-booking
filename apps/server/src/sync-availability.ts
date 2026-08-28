/**
 * One-off availability sync, run by hand from the deployed container — same
 * pattern as sync-catalogue.ts. Mirrors admin.provider.syncAvailability, except
 * it awaits the job instead of firing it and returning.
 *
 * Availability without a catalogue is meaningless (there'd be nothing to sync
 * dates for), but still bootstraps the provider row via ensureProviderId rather
 * than assuming sync-catalogue.ts already ran in this process — either order
 * against an empty database ends up in the same state.
 *
 * Takes `--provider <code>` for the same reason sync-catalogue.ts does:
 *
 *   pnpm --filter server sync:availability -- --provider booking_manager
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
  type AvailabilitySyncProgress,
  HOT_WINDOW_CURSOR_SCOPE,
  openAvailabilitySyncRun,
  readAvailabilitySyncErrorTotal,
  runAvailabilitySyncJob,
} from "@yacht-charter/providers/sync/availability-writer";
import { readSyncCursor } from "@yacht-charter/providers/sync/cursor";
import { ensureProviderId } from "@yacht-charter/providers/sync/runner";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";

const job = startJob("sync-availability");

const PROGRESS_INTERVAL_MS = 30_000;

/*
 * Every enabled provider, not the one PROVIDER_MODE names: that variable selects
 * who we transact through, not who we import from. `--provider <code>` narrows it
 * to one. The vendors run side by side, for the reason sync-catalogue.ts gives:
 * nothing is shared between them, so a tick costs the slowest rather than the sum.
 * Every line a run prints names its provider, which is what keeps two interleaved
 * streams readable; anything logged from in here needs to do the same.
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

const syncProvider = async (provider: InventoryProvider) => {
  const providerId = await ensureProviderId(db, provider.key);
  const resume = await readSyncCursor(db, {
    providerId,
    kind: "availability",
    scope: HOT_WINDOW_CURSOR_SCOPE,
  });

  let syncRunId: string;
  try {
    syncRunId = await openAvailabilitySyncRun(db, providerId);
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
    return;
  }

  console.log(`Started availability sync ${syncRunId} for provider "${provider.key}"`);
  const startedAt = Date.now();

  /*
   * Latest push from the run, printed on this side's timer rather than as it arrives:
   * a vendor with hundreds of scopes would otherwise write a line per company, and the
   * point of the heartbeat is to be readable next to the other provider's.
   */
  let progress: AvailabilitySyncProgress = { phase: "occupancy", scopeIndex: 0, scopeTotal: 0 };

  const logProgress = async () => {
    const elapsedS = Math.round((Date.now() - startedAt) / 1000);
    const errors = `sync_error this run: ${await readAvailabilitySyncErrorTotal(db, syncRunId)}`;

    /*
     * Only the occupancy pass walks scopes, so its counter is meaningless afterwards -
     * and a frozen "12/430" beside a climbing clock reads as a stall rather than as a
     * phase that does not walk them.
     */
    if (progress.phase !== "occupancy") {
      console.log(`[${provider.key} ${elapsedS}s] phase: ${progress.phase} | ${errors}`);
      return;
    }

    // listScopes is a vendor call, so a run can sit at zero for a while before the
    // total is known; "scopes -" says that, where "0/0" would read as nothing to do.
    const scopes =
      progress.scopeTotal === 0
        ? "scopes -"
        : `scopes ${progress.scopeIndex}/${progress.scopeTotal}`;

    console.log(`[${provider.key} ${elapsedS}s] phase: occupancy | ${scopes} | ${errors}`);
  };

  const progressTimer = setInterval(() => void logProgress(), PROGRESS_INTERVAL_MS);

  try {
    const result = await runAvailabilitySyncJob({
      db,
      provider,
      providerId,
      syncRunId,
      resume,
      onProgress: (next) => {
        // A phase change is rare and worth its own line; a scope tick is not.
        if (next.phase !== progress.phase) console.log(`[${provider.key}] phase: ${next.phase}`);
        progress = next;
      },
    });
    for (const line of JSON.stringify(result, null, 2).split("\n")) {
      console.log(`[${provider.key}] ${line}`);
    }
    console.log(`Availability sync ${syncRunId} finished for "${provider.key}"`);
    if (result.status === "failed") failed += 1;
  } catch (error) {
    // One vendor being down must not cost the other its refresh.
    failed += 1;
    console.error(`Availability sync failed for "${provider.key}":`, error);
  } finally {
    clearInterval(progressTimer);
  }
};

await Promise.all([...providers.values()].map(syncProvider));

await revalidateCatalogCache();

// See sync-catalogue.ts: the pool keeps the process alive, and a cron container
// that never exits blocks its own next run.
await db.$client.end();

if (skipped > 0) console.warn(`${skipped} provider(s) skipped: a sync of theirs is still running`);

const metrics = { providers: providers.size, failed, skipped };
if (failed > 0) {
  await job.failed(`${failed} provider sync(s) failed`, metrics);
  process.exit(1);
}

await job.done(metrics);
