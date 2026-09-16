import { listing } from "@yacht-charter/db/schema/listing";
import {
  type AvailabilityConstraints,
  listAvailabilityConstraints,
} from "@yacht-charter/db/search";
import { eq } from "drizzle-orm";

import type { Database } from "../../context";
import { NotFoundError } from "../../errors";

/** One offer's published constraints, keeping the rates the rules module has no use for. */
export type ListingOffer = AvailabilityConstraints["offers"][number] & { providerCode: string };

/**
 * The published constraints of every offer on one listing, in the form the pure availability
 * rules read.
 *
 * The existence check is here because the constraints read answers an unknown id with no offers,
 * which the rules then call a closed season: true of nothing, and misleading to a model that
 * mistyped the id.
 */
export async function loadListingOffers(
  db: Database,
  window: { listingId: string; from: string; to: string },
) {
  const [row] = await db
    .select({ id: listing.id })
    .from(listing)
    .where(eq(listing.id, window.listingId))
    .limit(1);
  if (!row) throw new NotFoundError({ message: "Unknown listing" });

  const constraints = await listAvailabilityConstraints(db, window);
  const offers: ListingOffer[] = constraints.offers.map((offer) => ({
    ...offer,
    providerCode: offer.provider,
  }));
  return { constraints, offers };
}
