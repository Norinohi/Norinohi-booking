import { booking } from "@yacht-charter/db/schema/booking";
import { listingOffer } from "@yacht-charter/db/schema/listing-offer";
import { provider } from "@yacht-charter/db/schema/provider";
import { quote } from "@yacht-charter/db/schema/quote";
import type { InventoryProvider } from "@yacht-charter/providers";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import type { Database } from "../context";
import { getEnabledInventoryProviders } from "../context";

/**
 * Which vendor a sale is actually going through.
 *
 * Read from the quote or the booking, never re-derived from the listing. A hull both providers
 * sell is quoted through whichever offer won on the day, and asking the listing afterwards
 * could only ever name whichever provider a preference list favoured — so the cancel, the
 * refund and the sweep could all reach a vendor that never held the reservation.
 *
 * `booking.provider` and `quote.provider` stay as the denormalised truth for rows that predate
 * the offer model, and the webhook and expiry paths have always read them. Both now agree with
 * the offer by construction, because the same selection writes all three.
 */

/** Architecture section 3: Booking Manager wins a tie between linked sources. */
const TRANSACTING_PREFERENCE = ["booking_manager", "nausys", "mock"];

/**
 * The vendor a listing would transact through when nothing has been quoted yet.
 *
 * Only for callers that have no quote to read — the availability calendar, and the fallback
 * inside `selectBestOffer` for a listing with no offers at all. A real sale never uses it.
 */
async function providerCodeForListing(db: Database, listingId: string): Promise<string | null> {
  const rows = await db
    .select({ code: provider.code })
    .from(listingOffer)
    .innerJoin(provider, eq(provider.id, listingOffer.providerId))
    .where(and(eq(listingOffer.listingId, listingId), eq(listingOffer.status, "active")));

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
  // No code means no provider source: a seeded or demo listing, which the
  // configured adapter is the right answer for and which refusing would break.
  if (!code || code === fallback.key) return fallback;

  const providers = await getEnabledInventoryProviders();
  const target = providers.get(code);
  if (target) return target;

  /*
   * A listing that names a provider this deployment cannot build must not fall
   * back. The configured adapter would answer for a boat it has never heard of:
   * against `mock` that is fixture pricing on a real yacht, and against the other
   * vendor it is a reservation id that vendor never issued.
   *
   * Refusing is recoverable, and it names the actual fault, which is a provider
   * left disabled while its listings are still published.
   */
  throw new ORPCError("SERVICE_UNAVAILABLE", {
    message: `Provider "${code}" is not enabled in this deployment`,
  });
}

/** The provider that priced this quote, so a re-price asks the same vendor. */
export async function providerForQuote(
  db: Database,
  fallback: InventoryProvider,
  quoteId: string,
): Promise<InventoryProvider> {
  const [row] = await db
    .select({ provider: quote.provider, listingId: quote.listingId })
    .from(quote)
    .where(eq(quote.id, quoteId))
    .limit(1);

  if (!row) return fallback;
  /* The vendor that answered, not the one the listing would pick today. */
  if (row.provider) return providerByKey(fallback, row.provider);
  return providerByKey(fallback, await providerCodeForListing(db, row.listingId));
}

/** The provider that holds this booking's reservation, for cancel and refund. */
export async function providerForBooking(
  db: Database,
  fallback: InventoryProvider,
  bookingId: string,
): Promise<InventoryProvider> {
  const [row] = await db
    .select({ provider: booking.provider, listingId: booking.listingId })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);

  if (!row) return fallback;
  /*
   * The vendor holding the reservation, which is a fact about this booking and not about the
   * catalogue. The expiry sweep, the Stripe webhook and the invoice path have always read this
   * column; reading it here too is what makes the two answers provably the same.
   */
  if (row.provider) return providerByKey(fallback, row.provider);
  return providerByKey(fallback, await providerCodeForListing(db, row.listingId));
}
