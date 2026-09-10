/**
 * Applies the amenity grouping map to the amenity rows already in the database, then rebuilds
 * the search documents of the listings it touched. Run by hand from the deployed container,
 * after a deploy that edits `packages/providers/src/shared/amenity-names.ts`.
 *
 * The catalogue sync writes the same column, so this is a shortcut rather than the mechanism:
 * without it an edit to the map is live only after the next full sync, which for Booking
 * Manager is twenty-five minutes of vendor calls for data we already hold.
 *
 * Defaults to a dry run, mirroring repair-bm-ids.ts. Pass `--apply` to write.
 */
import { db } from "@yacht-charter/db";
import { rebuildListingSearchDocs } from "@yacht-charter/db/search/read-model";
import { applyCanonicalAmenityNames } from "@yacht-charter/providers/sync/amenity-names";
import { revalidateCatalogCache } from "@yacht-charter/providers/sync/revalidate";

const apply = process.argv.includes("--apply");

if (!apply) {
  /* A dry run reports the map's size rather than a diff: finding out which rows would change
     means writing them, and the write is the thing being deferred. */
  const { canonicalAmenityNames } = await import("@yacht-charter/providers/shared/amenity-names");
  console.log(
    `${canonicalAmenityNames().size} vendor amenities would be grouped onto ` +
      `${new Set(canonicalAmenityNames().values()).size} marketplace amenities.\n` +
      "Dry run. Re-run with --apply to write these changes.",
  );
  await db.$client.end();
  process.exit(0);
}

const report = await applyCanonicalAmenityNames(db);
console.log(
  `Renamed ${report.updated} amenity rows, ${report.affectedListings.length} listings affected`,
);

if (report.affectedListings.length > 0) {
  const startedAt = Date.now();
  await rebuildListingSearchDocs(db, { listingIds: report.affectedListings });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`Rebuilt ${report.affectedListings.length} search documents in ${seconds}s`);

  const revalidated = await revalidateCatalogCache();
  console.log(
    revalidated.ok
      ? "Revalidated the web app's cached catalog"
      : `Did not revalidate the web app's cached catalog (${revalidated.reason ?? "unknown reason"})`,
  );
}

// See sync-catalogue.ts: an idle pool client holds the event loop open.
await db.$client.end();
