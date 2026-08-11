/**
 * One-off availability sync, run by hand from the deployed container — same
 * pattern as sync-catalogue.ts. Mirrors admin.provider.syncAvailability, except
 * it awaits the job instead of firing it and returning.
 */
import { db } from "@yacht-charter/db";
import { createInventoryProvider } from "@yacht-charter/providers";
import {
  HOT_WINDOW_CURSOR_SCOPE,
  openAvailabilitySyncRun,
  runAvailabilitySyncJob,
} from "@yacht-charter/providers/sync/availability-writer";
import { readSyncCursor } from "@yacht-charter/providers/sync/cursor";
import { resolveProviderId } from "@yacht-charter/providers/sync/runner";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";

const provider = createInventoryProvider({ db });
const providerId = await resolveProviderId(db, provider.key);
const syncRunId = await openAvailabilitySyncRun(db, providerId);
const resume = await readSyncCursor(db, {
  providerId,
  kind: "availability",
  scope: HOT_WINDOW_CURSOR_SCOPE,
});

console.log(`Started availability sync ${syncRunId} for provider "${provider.key}"`);

const result = await runAvailabilitySyncJob({ db, provider, providerId, syncRunId, resume });

await revalidateCatalogCache();

console.log(JSON.stringify(result, null, 2));
console.log(`Availability sync ${syncRunId} finished`);
