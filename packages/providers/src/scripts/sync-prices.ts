/**
 * Runs the seasonal price sweep on its own.
 *
 * Prices are Phase C of the catalogue job, and there was no way to reach them
 * without the phases in front: a full walk of every charter company, which on
 * Booking Manager is 1300 of them and does not finish inside one container run.
 * A listing with slots and free periods but no published rate shows an empty
 * calendar - the constraints query treats a rate as what makes a date sellable at
 * all - so "the catalogue import is still going" and "this boat is unbookable"
 * look identical to a customer.
 *
 * Deliberately narrow. It reads `listing_source` to decide what to price and
 * writes `listing_price_period`. It does not ingest, does not project, does not
 * touch `provider_record`, and cannot retire or hide anything - which is what
 * makes it safe to point at production while a catalogue sync is still unfinished.
 *
 *   pnpm --filter @yacht-charter/providers prices:sync -- --provider booking_manager
 *   pnpm --filter @yacht-charter/providers prices:sync -- --provider booking_manager --company 225
 */
import { db } from "@yacht-charter/db";
import { rebuildListingSearchDocsForListings } from "@yacht-charter/db/search/read-model";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { provider as providerTable, providerRecord } from "@yacht-charter/db/schema/provider";
import { and, eq, isNotNull } from "drizzle-orm";

import { createInventoryProvider } from "../registry";
import {
  createDrizzlePricePeriodStore,
  supportsSeasonalPrices,
  writeSeasonalPrices,
} from "../sync/price-writer";
import { revalidateCatalogCache } from "../sync/revalidate";
import { providerKeySchema } from "../types";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};

const providerKey = providerKeySchema.parse(flag("provider") ?? "booking_manager");
const externalCompanyId = flag("company");

async function main(): Promise<void> {
  const [row] = await db
    .select({ id: providerTable.id })
    .from(providerTable)
    .where(eq(providerTable.code, providerKey))
    .limit(1);

  if (!row) throw new Error(`No provider row with code "${providerKey}"`);
  const providerId = row.id;

  const provider = createInventoryProvider({ db }, providerKey);
  if (!supportsSeasonalPrices(provider)) {
    throw new Error(`${providerKey} publishes no seasonal price list`);
  }

  const listings = await db
    .selectDistinct({ listingId: listingSource.listingId })
    .from(listingSource)
    .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
    .where(
      and(
        eq(providerRecord.providerId, providerId),
        eq(providerRecord.active, true),
        isNotNull(listingSource.listingId),
        externalCompanyId === undefined
          ? undefined
          : eq(listingSource.externalCompanyId, externalCompanyId),
      ),
    );

  const listingIds = listings.flatMap((item) => (item.listingId ? [item.listingId] : []));
  const scope = externalCompanyId === undefined ? "every company" : `company ${externalCompanyId}`;
  console.log(`${providerKey}: pricing ${listingIds.length} listings across ${scope}\n`);

  if (listingIds.length === 0) {
    console.log("nothing to price");
    await db.$client.end();
    return;
  }

  const started = Date.now();
  const pricePeriods = await writeSeasonalPrices({
    store: createDrizzlePricePeriodStore({ db, providerId }),
    listingIds,
    loadSeasonalPrices: (ids) => provider.loadSeasonalPrices(ids),
  });

  console.log(
    `wrote ${pricePeriods} price periods in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  /*
   * `bookable_from` and the card's "from" price are materialised into
   * `listing_search_doc`, not read live, so a rate written without this rebuild
   * shows a working calendar on the detail page and a card with no availability on
   * the search results beside it. Only then the cache, which fronts both.
   */
  await rebuildListingSearchDocsForListings(db, listingIds);
  await revalidateCatalogCache();
  console.log(`rebuilt ${listingIds.length} search documents`);
  await db.$client.end();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await db.$client.end();
  process.exit(1);
});
