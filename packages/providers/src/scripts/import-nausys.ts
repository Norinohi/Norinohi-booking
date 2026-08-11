/**
 * One-off NauSYS catalogue import.
 *
 * Builds the adapter directly instead of going through `createInventoryProvider`,
 * so the import runs while `PROVIDER_MODE` stays `mock`. That matters right now:
 * the agency credential is not permitted to call `freeYachts`, so switching the
 * whole app to nausys would import a catalogue and break every checkout quote.
 *
 * Imported listings land as `draft` on purpose. Publishing is a separate,
 * deliberate step; see `--publish`.
 *
 *   pnpm --filter @yacht-charter/providers import:nausys -- [--publish] [--limit N]
 */
import { db } from "@yacht-charter/db";
import { listing } from "@yacht-charter/db/schema/listing";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { provider as providerTable, providerRecord } from "@yacht-charter/db/schema/provider";
import { rebuildSearchReadModelsAfterSync } from "@yacht-charter/db/search/read-model";
import { and, eq, inArray, sql } from "drizzle-orm";

import { NausysInventoryProvider } from "../nausys/provider";
import { resolveNausysConfig } from "../nausys/config";
import { openCatalogueSyncRun, runCatalogueSyncJob } from "../sync/runner";
import { runAvailabilitySyncJob } from "../sync/availability-writer";
import { syncRun } from "@yacht-charter/db/schema/provider";

const args = new Set(process.argv.slice(2));
const publish = args.has("--publish");

async function ensureProviderRow(): Promise<string> {
  const existing = await db
    .select({ id: providerTable.id })
    .from(providerTable)
    .where(eq(providerTable.code, "nausys"))
    .limit(1);

  if (existing[0]) return existing[0].id;

  const [row] = await db
    .insert(providerTable)
    .values({
      code: "nausys",
      name: "NauSYS",
      enabled: true,
      defaultCurrency: "EUR",
    })
    .returning({ id: providerTable.id });

  if (!row) throw new Error("failed to create the nausys provider row");
  console.log(`created provider row ${row.id}`);
  return row.id;
}

async function main(): Promise<void> {
  const config = resolveNausysConfig();
  console.log(`host ${config.baseUrl}  user ${config.username}`);

  const providerId = await ensureProviderRow();
  const provider = new NausysInventoryProvider({ db, config });

  const syncRunId = await openCatalogueSyncRun(db, providerId);
  console.log(`sync run ${syncRunId} started\n`);

  const started = Date.now();
  const result = await runCatalogueSyncJob({ db, provider, providerId, syncRunId });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\nfinished in ${seconds}s`);
  console.log(JSON.stringify(result, null, 2));

  const [counts] = await db
    .select({
      records: sql<number>`count(*) filter (where ${providerRecord.active})::int`,
      yachts: sql<number>`count(*) filter (where ${providerRecord.resourceType} = 'yacht')::int`,
    })
    .from(providerRecord)
    .where(eq(providerRecord.providerId, providerId));
  console.log("provider_record:", counts);

  const listingIds = (
    await db
      .selectDistinct({ id: listingSource.listingId })
      .from(listingSource)
      .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
      .where(and(eq(providerRecord.providerId, providerId), eq(providerRecord.active, true)))
  )
    .map((r) => r.id)
    .filter((id): id is string => id !== null);

  console.log(`linked listings: ${listingIds.length}`);

  const sample = await db
    .select({
      id: listing.id,
      slug: listing.slug,
      title: listing.title,
      status: listing.status,
      currency: listing.defaultCurrency,
    })
    .from(listing)
    .where(inArray(listing.id, listingIds.slice(0, 5)));
  console.table(sample);

  if (args.has("--availability")) {
    const [run] = await db
      .insert(syncRun)
      .values({ providerId, kind: "availability", status: "pending" })
      .returning({ id: syncRun.id });
    if (!run) throw new Error("availability sync_run insert returned no row");

    console.log(`\navailability run ${run.id} started`);
    const availStarted = Date.now();
    const summary = await runAvailabilitySyncJob({
      db,
      provider,
      providerId,
      syncRunId: run.id,
    });
    console.log(`finished in ${((Date.now() - availStarted) / 1000).toFixed(1)}s`);
    console.log(JSON.stringify(summary, null, 2));
  }

  if (!publish) {
    console.log("\nlistings left as draft; re-run with --publish to expose them in search");
    return;
  }

  await db.update(listing).set({ status: "published" }).where(inArray(listing.id, listingIds));
  await rebuildSearchReadModelsAfterSync(db, { listingIds });
  console.log(`\npublished ${listingIds.length} listings and rebuilt the search read model`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
