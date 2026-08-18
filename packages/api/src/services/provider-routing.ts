import { booking } from "@yacht-charter/db/schema/booking";
import { listing } from "@yacht-charter/db/schema/listing";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { provider, providerRecord } from "@yacht-charter/db/schema/provider";
import { quote } from "@yacht-charter/db/schema/quote";
import type { InventoryProvider } from "@yacht-charter/providers";
import { and, eq } from "drizzle-orm";

import type { Database } from "../context";
import { getEnabledInventoryProviders } from "../context";

/**
 * Which vendor a listing is actually sold through.
 *
 * This used to be `PROVIDER_MODE`, which was true only while one provider had
 * published inventory. With two, quoting a Booking Manager yacht through the
 * NauSYS adapter fails at the resolver: it looks for a NauSYS source the listing
 * does not have. The listing itself knows the answer, so it is read rather than
 * configured.
 *
 * `primary_source_id` wins when set, because that is the merge decision a human
 * made. Otherwise the sole active source answers, and a listing carrying more
 * than one falls back to the architecture's tie-break rather than to whichever
 * row the database happened to return first.
 */

/** Architecture section 3: Booking Manager wins a tie between linked sources. */
const TRANSACTING_PREFERENCE = ["booking_manager", "nausys", "mock"];

async function providerCodeForListing(db: Database, listingId: string): Promise<string | null> {
  const [primary] = await db
    .select({ code: provider.code })
    .from(listing)
    .innerJoin(listingSource, eq(listingSource.id, listing.primarySourceId))
    .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
    .innerJoin(provider, eq(provider.id, providerRecord.providerId))
    .where(eq(listing.id, listingId))
    .limit(1);
  if (primary) return primary.code;

  const rows = await db
    .select({ code: provider.code })
    .from(listingSource)
    .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
    .innerJoin(provider, eq(provider.id, providerRecord.providerId))
    .where(and(eq(listingSource.listingId, listingId), eq(providerRecord.active, true)));

  const codes = rows.map((row) => row.code);
  return TRANSACTING_PREFERENCE.find((code) => codes.includes(code)) ?? codes[0] ?? null;
}

/**
 * The adapter for a provider code, or the configured one when the code is absent
 * or not enabled in this deployment.
 *
 * Exported because the expiry sweep already holds the code: `booking.provider`
 * records who a hold was taken with, so releasing it needs the right adapter
 * rather than another lookup.
 */
export async function providerByKey(
  fallback: InventoryProvider,
  code: string | null,
): Promise<InventoryProvider> {
  // Falling back rather than throwing: a listing with no source is either seeded
  // or mid-import, and refusing to quote it would be a worse answer than the one
  // the single-provider build already gave.
  if (!code || code === fallback.key) return fallback;
  const providers = await getEnabledInventoryProviders();
  return providers.get(code) ?? fallback;
}

/** The provider that prices and books this listing. */
export async function providerForListing(
  db: Database,
  fallback: InventoryProvider,
  listingId: string,
): Promise<InventoryProvider> {
  return providerByKey(fallback, await providerCodeForListing(db, listingId));
}

/** The provider that priced this quote, so a re-price asks the same vendor. */
export async function providerForQuote(
  db: Database,
  fallback: InventoryProvider,
  quoteId: string,
): Promise<InventoryProvider> {
  const [row] = await db
    .select({ listingId: quote.listingId })
    .from(quote)
    .where(eq(quote.id, quoteId))
    .limit(1);

  if (!row?.listingId) return fallback;
  return providerByKey(fallback, await providerCodeForListing(db, row.listingId));
}

/** The provider that holds this booking's reservation, for cancel and refund. */
export async function providerForBooking(
  db: Database,
  fallback: InventoryProvider,
  bookingId: string,
): Promise<InventoryProvider> {
  const [row] = await db
    .select({ listingId: booking.listingId })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);

  if (!row?.listingId) return fallback;
  return providerByKey(fallback, await providerCodeForListing(db, row.listingId));
}
