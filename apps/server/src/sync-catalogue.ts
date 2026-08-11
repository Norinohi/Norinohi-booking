/**
 * One-off catalogue sync, run by hand from the deployed container — `railway run`
 * or the dashboard shell, same env as the live server. Mirrors what
 * admin.provider.syncCatalogue kicks off, except it awaits the job instead of
 * firing it and returning, so the run's outcome prints before the process exits.
 *
 * A full NauSYS catalogue is a multi-hour walk (see services/provider-sync.ts in
 * packages/api) — expect this to take a while on a real account.
 */
import { db } from "@yacht-charter/db";
import { createInventoryProvider } from "@yacht-charter/providers";
import {
  openCatalogueSyncRun,
  resolveProviderId,
  runCatalogueSyncJob,
} from "@yacht-charter/providers/sync/runner";
import { readSyncCursor } from "@yacht-charter/providers/sync/cursor";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";

const provider = createInventoryProvider({ db });
const providerId = await resolveProviderId(db, provider.key);
const syncRunId = await openCatalogueSyncRun(db, providerId);
const resume = await readSyncCursor(db, { providerId, kind: "catalogue", scope: "full" });

console.log(`Started catalogue sync ${syncRunId} for provider "${provider.key}"`);

const result = await runCatalogueSyncJob({
  db,
  provider,
  providerId,
  syncRunId,
  resume,
  cursorScope: "full",
});

await revalidateCatalogCache();

console.log(JSON.stringify(result, null, 2));
console.log(`Catalogue sync ${syncRunId} finished`);
