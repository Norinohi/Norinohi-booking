/**
 * Rebuilds every published listing's search document, run by hand from the deployed
 * container — same pattern as publish-listings.ts and the sync entry points.
 *
 * The gap this fills: `listing_search_doc` is a projection, and every other caller
 * rebuilds it **scoped** — `rebuildSearchReadModelsAfterSync(db, { listingIds })` after a
 * sync, a match, an admin edit. That is right for those, which know exactly what they
 * touched. It is wrong for a change to the projection SQL itself, which changes what every
 * row should contain while touching no listing at all. Deploying such a change used to
 * leave the old values in place indefinitely, refreshed only as listings happened to be
 * re-synced for unrelated reasons, so a fix looked live on the detail page — which reads
 * through — and stayed broken on the search card, which reads the document.
 *
 * So: run this after any deploy that edits packages/db/src/search/read-model.ts. It is a
 * single upsert over the published fleet and is safe to repeat.
 *
 * It also derives the two offer flags first. `pets_allowed` and `deposit_insurance_included`
 * are read out of the fee catalogue rather than sent by either vendor, and the only other
 * place that runs is the catalogue sync -- so without this line a deploy would leave both
 * badges and both filters empty until the next nightly run, which for Booking Manager is
 * twenty-five minutes of vendor calls to recover data already sitting in our own tables.
 */
import { db } from "@yacht-charter/db";
import {
  readListingSearchDocStats,
  rebuildListingSearchDocs,
} from "@yacht-charter/db/search/read-model";
import { refreshOfferFlags } from "@yacht-charter/providers/sync/offer-flags";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";

const startedAt = Date.now();

await refreshOfferFlags(db);
await rebuildListingSearchDocs(db);

const stats = await readListingSearchDocStats(db);
const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(
  `Rebuilt ${stats.docs} search documents in ${seconds}s ` +
    `(${stats.priced} priced, ${stats.basePriced} with a charter rate, ` +
    `${stats.bookable} with a bookable period)`,
);

/* A rate above the all-in total it belongs to cannot happen and would silently reverse the
   ordering wherever the cards are set to compare rates, so it is shouted about rather than
   left for somebody to notice in the ranking. */
if (stats.baseAboveAllIn > 0) {
  console.warn(
    `${stats.baseAboveAllIn} documents carry a charter rate above their all-in total — ` +
      "the two are assembled separately and one of them is wrong",
  );
}

/* The web app caches the catalog for hours to days, so without this the rebuild is
   invisible until that window rolls over — which is the same wait this exists to end. */
const revalidated = await revalidateCatalogCache();
console.log(
  revalidated.ok
    ? "Revalidated the web app's cached catalog"
    : `Did not revalidate the web app's cached catalog (${revalidated.reason ?? "unknown reason"}) — it'll still catch up on its own cache window`,
);

// An idle pool client holds the event loop open, and a container that never exits reads to
// the host as a run still in progress. See apps/server/AGENTS.md.
await db.$client.end();
