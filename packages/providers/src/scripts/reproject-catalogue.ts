/**
 * Rebuilds the catalogue from the payloads already stored, without asking a vendor anything.
 *
 * Phase B of the catalogue job on its own. `provider_raw_payload` keeps every response we have
 * ever been given, and `projectCatalogue` is pure, so the whole projection can be replayed
 * offline — which is what the move to offers needs: each vendor's own title, specs, media,
 * equipment, prose and check-in rules written to its own `listing_offer` instead of fought over
 * on the shared listing row.
 *
 *   pnpm --filter @yacht-charter/providers catalogue:reproject -- --provider booking_manager
 *   pnpm --filter @yacht-charter/providers catalogue:reproject -- --provider nausys --apply
 *
 * Deliberately narrow, like the price sweep beside it. It ingests nothing, touches no
 * `provider_record`, and makes no network call at all, so it is safe to point at production
 * while a sync is running. It does rewrite every listing it projects, which is the point.
 *
 * A record whose payload has been pruned cannot be replayed and is reported rather than
 * skipped quietly: those need a real catalogue sync.
 */
import { db } from "@yacht-charter/db";
import { rebuildListingSearchDocsForListings } from "@yacht-charter/db/search/read-model";
import { provider as providerTable, providerRecord } from "@yacht-charter/db/schema/provider";
import { and, count, eq, isNull } from "drizzle-orm";

import { createInventoryProvider } from "../registry";
import { loadProviderRecordSet, writeCanonicalCatalogue } from "../sync/catalogue-writer";
import { readAutoPublish } from "../sync/runner";
import { revalidateCatalogCache } from "../sync/revalidate";
import { providerKeySchema } from "../types";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};

const providerKey = providerKeySchema.parse(flag("provider") ?? "booking_manager");
const apply = argv.includes("--apply");

async function main(): Promise<void> {
  const [row] = await db
    .select({ id: providerTable.id })
    .from(providerTable)
    .where(eq(providerTable.code, providerKey))
    .limit(1);

  if (!row) throw new Error(`Provider ${providerKey} is not registered`);

  const [missing] = await db
    .select({ total: count() })
    .from(providerRecord)
    .where(
      and(
        eq(providerRecord.providerId, row.id),
        eq(providerRecord.resourceType, "yacht"),
        eq(providerRecord.active, true),
        isNull(providerRecord.rawPayloadId),
      ),
    );

  if ((missing?.total ?? 0) > 0) {
    console.log(
      `${missing?.total} active yacht records have no stored payload and cannot be replayed; they need a real catalogue sync.`,
    );
  }

  const records = await loadProviderRecordSet(db, row.id);
  const yachts = records.get("yacht")?.length ?? 0;
  console.log(`${providerKey}: ${yachts} yacht payloads to project`);

  if (!apply) {
    console.log("\nDry run. Pass --apply to write.");
    return;
  }

  const provider = createInventoryProvider({ db }, providerKey);
  const catalogue = provider.projectCatalogue(records);

  const summary = await writeCanonicalCatalogue({
    db,
    providerId: row.id,
    providerKey,
    catalogue,
    /*
     * Whatever the provider is trusted with. Not forced on: a re-projection is a repair of
     * rows that already exist, and it must not be the thing that publishes a backlog of
     * drafts nobody has reviewed.
     */
    autoPublish: await readAutoPublish(db, row.id, providerKey),
    reportListingError: ({ externalId, error }) => {
      console.error(`  ${externalId}: ${error instanceof Error ? error.message : error}`);
      return Promise.resolve();
    },
  });

  console.log(
    `created ${summary.listingsCreated}, updated ${summary.listingsUpdated}, ` +
      `skipped ${summary.listingsSkipped}, failed ${summary.listingsFailed}, ` +
      `hidden ${summary.listingsHidden}, duplicate candidates ${summary.duplicateCandidates}`,
  );

  await rebuildListingSearchDocsForListings(db, summary.rebuildListingIds);
  console.log(`rebuilt ${summary.rebuildListingIds.length} search documents`);

  await revalidateCatalogCache();
}

/* A catch binding rather than a handler parameter, so nothing has to accept an `unknown`. */
try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
