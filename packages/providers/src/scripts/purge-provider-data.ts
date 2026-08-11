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
  syncRun,
} from "@yacht-charter/db/schema/provider";
import { quote } from "@yacht-charter/db/schema/quote";
import { eq, inArray } from "drizzle-orm";

import { revalidateCatalogCache } from "../sync/revalidate";

const argv = process.argv.slice(2);
const at = argv.indexOf("--provider");
const providerCode = at === -1 ? "mock" : (argv[at + 1] ?? "mock");
const confirmed = argv.includes("--confirm");

async function main(): Promise<void> {
  const [row] = await db
    .select({ id: provider.id })
    .from(provider)
    .where(eq(provider.code, providerCode))
    .limit(1);

  if (!row) throw new Error(`No provider row with code "${providerCode}"`);
  const providerId = row.id;

  const listingIds = (
    await db
      .selectDistinct({ id: listingSource.listingId })
      .from(listingSource)
      .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
      .where(eq(providerRecord.providerId, providerId))
  )
    .map((item) => item.id)
    .filter((id): id is string => id !== null);

  const counts = {
    listings: listingIds.length,
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

  console.log(`provider "${providerCode}" (${providerId})`);
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
    const recordIds = (
      await tx
        .select({ id: providerRecord.id })
        .from(providerRecord)
        .where(eq(providerRecord.providerId, providerId))
    ).map((item) => item.id);

    if (recordIds.length > 0) {
      await tx.delete(listingSource).where(inArray(listingSource.providerRecordId, recordIds));
      await tx.delete(providerRecord).where(eq(providerRecord.providerId, providerId));
    }

    await tx.delete(syncRun).where(eq(syncRun.providerId, providerId));
    await tx.delete(providerRawPayload).where(eq(providerRawPayload.providerId, providerId));
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
