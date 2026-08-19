/**
 * One-off availability sync, run by hand from the deployed container — same
 * pattern as sync-catalogue.ts. Mirrors admin.provider.syncAvailability, except
 * it awaits the job instead of firing it and returning.
 *
 * Availability without a catalogue is meaningless (there'd be nothing to sync
 * dates for), but still bootstraps the provider row via ensureProviderId rather
 * than assuming sync-catalogue.ts already ran in this process — either order
 * against an empty database ends up in the same state.
 */
import { db } from "@yacht-charter/db";
import { createEnabledInventoryProviders } from "@yacht-charter/providers";
import {
  HOT_WINDOW_CURSOR_SCOPE,
  openAvailabilitySyncRun,
  runAvailabilitySyncJob,
} from "@yacht-charter/providers/sync/availability-writer";
import { readSyncCursor } from "@yacht-charter/providers/sync/cursor";
import { ensureProviderId } from "@yacht-charter/providers/sync/runner";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";

/*
 * Every enabled provider, not the one PROVIDER_MODE names: that variable selects
 * who we transact through, not who we import from. See sync-catalogue.ts for why
 * this runs one vendor at a time.
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
  const resume = await readSyncCursor(db, {
    providerId,
    kind: "availability",
    scope: HOT_WINDOW_CURSOR_SCOPE,
  });

  let syncRunId: string;
  try {
    syncRunId = await openAvailabilitySyncRun(db, providerId);
  } catch (error) {
    failed += 1;
    console.error(`Skipped "${provider.key}": ${error instanceof Error ? error.message : error}`);
    continue;
  }

  console.log(`Started availability sync ${syncRunId} for provider "${provider.key}"`);

  try {
    const result = await runAvailabilitySyncJob({ db, provider, providerId, syncRunId, resume });
    console.log(JSON.stringify(result, null, 2));
    console.log(`Availability sync ${syncRunId} finished for "${provider.key}"`);
    if (result.status === "failed") failed += 1;
  } catch (error) {
    // One vendor being down must not cost the other its refresh.
    failed += 1;
    console.error(`Availability sync failed for "${provider.key}":`, error);
  }
}

await revalidateCatalogCache();

// See sync-catalogue.ts: the pool keeps the process alive, and a cron container
// that never exits blocks its own next run.
await db.$client.end();

if (failed > 0) process.exit(1);
