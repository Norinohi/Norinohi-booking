/**
 * Shows or hides every listing belonging to one provider.
 *
 * `PROVIDER_MODE` does not do this: it chooses the runtime adapter for quotes and
 * bookings, while what the site displays is whatever `listing.status` says. Seeded
 * mock listings are real published rows and stay visible whatever the mode is.
 *
 * Hidden rather than deleted. `rebuildListingSearchDocs` drops non-published rows
 * from the search read model, so hiding is enough to clear them from the site, and
 * it is reversible.
 *
 *   pnpm --filter @yacht-charter/providers listings:visibility -- --provider mock --hide
 *   pnpm --filter @yacht-charter/providers listings:visibility -- --provider mock --show
 */
import { db } from "@yacht-charter/db";
import { listing } from "@yacht-charter/db/schema/listing";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { provider, providerRecord } from "@yacht-charter/db/schema/provider";
import { rebuildSearchReadModelsAfterSync } from "@yacht-charter/db/search/read-model";
import { eq, inArray } from "drizzle-orm";

import { revalidateCatalogCache } from "../sync/revalidate";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};

const providerCode = flag("provider") ?? "mock";
const hide = argv.includes("--hide");
const show = argv.includes("--show");

async function main(): Promise<void> {
  if (hide === show) {
    throw new Error("Pass exactly one of --hide or --show");
  }

  const [row] = await db
    .select({ id: provider.id })
    .from(provider)
    .where(eq(provider.code, providerCode))
    .limit(1);

  if (!row) throw new Error(`No provider row with code "${providerCode}"`);

  const listingIds = (
    await db
      .selectDistinct({ id: listingSource.listingId })
      .from(listingSource)
      .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
      .where(eq(providerRecord.providerId, row.id))
  )
    .map((item) => item.id)
    .filter((id): id is string => id !== null);

  if (listingIds.length === 0) {
    console.log(`no listings linked to "${providerCode}"`);
    return;
  }

  const status = hide ? "hidden" : "published";
  await db.update(listing).set({ status }).where(inArray(listing.id, listingIds));
  await rebuildSearchReadModelsAfterSync(db, { listingIds });

  const revalidated = await revalidateCatalogCache();
  console.log(
    `${status} ${listingIds.length} "${providerCode}" listings; ` +
      (revalidated.ok ? "cache dropped" : `cache not dropped (${revalidated.reason})`),
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
