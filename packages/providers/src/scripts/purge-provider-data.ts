/**
 * Deletes every listing belonging to one provider, and the rows that hang off it.
 *
 * Read this before running it. A reset (`pnpm db:down && pnpm db:start && pnpm
 * db:migrate`) is the better move whenever the database is disposable, because it
 * is total and cannot half-succeed. This script exists for the case where it is
 * not disposable: a staging database with real accounts, sessions or bookings you
 * want to keep while the seeded demo inventory goes away.
 *
 * Two things make a blind "delete everything the seed made" wrong, and both are
 * why this deletes by listing rather than by row provenance:
 *
 *  - `booking` and `quote` reference `listing` with ON DELETE RESTRICT, so they
 *    block the delete and have to go first. They are financial and audit records.
 *    That is the whole reason this defaults to a dry run.
 *  - Taxonomy is deduplicated on purpose. `builder` keys on slug and `country` on
 *    code, so rows the mock seed created are now pointed at by real provider
 *    listings. Deleting "the seed's" builders would break live inventory. They are
 *    left alone; an unreferenced taxonomy row costs nothing.
 *
 *   pnpm --filter @yacht-charter/providers listings:purge -- --provider mock
 *   pnpm --filter @yacht-charter/providers listings:purge -- --provider mock --confirm
 *
 * `--keep-company` and `--keep-yacht` (repeatable) narrow it to a partial purge:
 * every listing of the provider EXCEPT the ones they name goes, and the reference
 * data, sync history and raw payloads stay untouched because the provider is still
 * present. Without either flag the purge is total, as above.
 *
 *   pnpm --filter @yacht-charter/providers listings:purge -- \
 *     --provider booking_manager --keep-company 225 --keep-yacht 6463214670000102746
 */
import { db } from "@yacht-charter/db";
import { availabilitySlot } from "@yacht-charter/db/schema/availability";
import { booking } from "@yacht-charter/db/schema/booking";
import { listing } from "@yacht-charter/db/schema/listing";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import {
  provider,
  providerRawPayload,
  providerRecord,
  syncCursor,
  syncRun,
} from "@yacht-charter/db/schema/provider";
import { quote } from "@yacht-charter/db/schema/quote";
import { eq, inArray } from "drizzle-orm";

import { revalidateCatalogCache } from "../sync/revalidate";

const argv = process.argv.slice(2);
const at = argv.indexOf("--provider");
const providerCode = at === -1 ? "mock" : (argv[at + 1] ?? "mock");
const confirmed = argv.includes("--confirm");

/** Every value given to a repeatable flag, e.g. `--keep-yacht a --keep-yacht b`. */
function valuesOf(flag: string): string[] {
  return argv
    .map((arg, index) => (arg === flag ? argv[index + 1] : undefined))
    .filter((value): value is string => value !== undefined && !value.startsWith("--"));
}

const keptCompanies = new Set(valuesOf("--keep-company"));
const keptYachts = new Set(valuesOf("--keep-yacht"));
const partial = keptCompanies.size > 0 || keptYachts.size > 0;

async function main(): Promise<void> {
  const [row] = await db
    .select({ id: provider.id })
    .from(provider)
    .where(eq(provider.code, providerCode))
    .limit(1);

  if (!row) throw new Error(`No provider row with code "${providerCode}"`);
  const providerId = row.id;

  const sources = await db
    .select({
      listingSourceId: listingSource.id,
      listingId: listingSource.listingId,
      providerRecordId: listingSource.providerRecordId,
      externalYachtId: listingSource.externalYachtId,
      externalCompanyId: listingSource.externalCompanyId,
    })
    .from(listingSource)
    .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
    .where(eq(providerRecord.providerId, providerId));

  const doomed = sources.filter(
    (source) =>
      !keptYachts.has(source.externalYachtId) &&
      !(source.externalCompanyId !== null && keptCompanies.has(source.externalCompanyId)),
  );

  const listingIds = [
    ...new Set(doomed.map((source) => source.listingId).filter((id): id is string => id !== null)),
  ];

  const counts = {
    listings: listingIds.length,
    kept: sources.length - doomed.length,
    bookings: 0,
    quotes: 0,
    slots: 0,
  };

  if (listingIds.length > 0) {
    counts.bookings = (
      await db
        .select({ id: booking.id })
        .from(booking)
        .where(inArray(booking.listingId, listingIds))
    ).length;
    counts.quotes = (
      await db.select({ id: quote.id }).from(quote).where(inArray(quote.listingId, listingIds))
    ).length;
    counts.slots = (
      await db
        .select({ id: availabilitySlot.id })
        .from(availabilitySlot)
        .where(inArray(availabilitySlot.listingId, listingIds))
    ).length;
  }

  console.log(`provider "${providerCode}" (${providerId})${partial ? ", partial purge" : ""}`);
  console.table(counts);

  if (!confirmed) {
    console.log(
      "\ndry run, nothing deleted." +
        (counts.bookings > 0
          ? `\n${counts.bookings} bookings and ${counts.quotes} quotes would be DESTROYED; they are audit records.`
          : "") +
        "\nre-run with --confirm to proceed.",
    );
    return;
  }

  await db.transaction(async (tx) => {
    if (listingIds.length > 0) {
      // RESTRICT on both, so they must precede the listings. Everything else
      // (media, amenities, specs, slots, reviews, wishlist, search docs) cascades.
      await tx.delete(booking).where(inArray(booking.listingId, listingIds));
      await tx.delete(quote).where(inArray(quote.listingId, listingIds));
      await tx.delete(listing).where(inArray(listing.id, listingIds));
    }

    // `listing_source.listing_id` is ON DELETE SET NULL, so the provenance rows
    // outlive their listings and have to be cleared explicitly.
    const recordIds = partial
      ? [...new Set(doomed.map((source) => source.providerRecordId))]
      : (
          await tx
            .select({ id: providerRecord.id })
            .from(providerRecord)
            .where(eq(providerRecord.providerId, providerId))
        ).map((item) => item.id);

    if (recordIds.length > 0) {
      await tx.delete(listingSource).where(inArray(listingSource.providerRecordId, recordIds));
      await tx.delete(providerRecord).where(inArray(providerRecord.id, recordIds));
    }

    // Only on a total purge: a partial one leaves the provider in place, and its
    // reference data, cursors and raw payloads still belong to the fleet that stays.
    if (!partial) {
      await tx.delete(syncRun).where(eq(syncRun.providerId, providerId));
      await tx.delete(providerRawPayload).where(eq(providerRawPayload.providerId, providerId));
      /*
       * The cursors last, and they are not optional bookkeeping. `sync_cursor` is where the
       * walk resumes from, so a total purge that leaves them behind deletes the fleet and
       * keeps the position in it: the next sync picks up mid-catalogue and re-imports the
       * tail of what was just removed. Deleting a provider's whole inventory has to mean the
       * next run starts over.
       */
      await tx.delete(syncCursor).where(eq(syncCursor.providerId, providerId));
    }
  });

  const revalidated = await revalidateCatalogCache();
  console.log(
    `\ndeleted ${counts.listings} listings and their provenance; ` +
      (revalidated.ok ? "cache dropped" : `cache not dropped (${revalidated.reason})`),
  );
  console.log(
    "Shared taxonomy (builders, models, countries, amenities) was left in place: it is " +
      "deduplicated across providers and live listings point at it.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
