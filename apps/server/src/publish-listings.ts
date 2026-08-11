/**
 * One-off publish pass, run by hand from the deployed container — same pattern
 * as sync-catalogue.ts and sync-availability.ts.
 *
 * A real provider sync deliberately never publishes what it creates (see the
 * comment in packages/providers/src/sync/catalogue-writer.ts — thousands of
 * unreviewed yachts must not go live on the first run), and listing_search_doc
 * only carries published listings (packages/db/src/search/read-model.ts), so a
 * freshly-synced catalogue is invisible to search until something publishes it.
 * There's no review UI yet, so this publishes everything still in draft — fine
 * for a single-provider environment with no moderation queue; a real one would
 * need actual review criteria before this runs unattended.
 */
import { db } from "@yacht-charter/db";
import { publishDraftListings } from "@yacht-charter/db/search/read-model";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";

const { publishedCount } = await publishDraftListings(db);

console.log(`Published ${publishedCount} listings and rebuilt their search docs`);

if (publishedCount > 0) {
  const revalidated = await revalidateCatalogCache();
  console.log(
    revalidated.ok
      ? "Revalidated the web app's cached catalog"
      : `Did not revalidate the web app's cached catalog (${revalidated.reason ?? "unknown reason"}) — it'll still catch up on its own cache window`,
  );
}
