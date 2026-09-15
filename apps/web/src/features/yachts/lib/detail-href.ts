import type { AppPathname } from "@/i18n/navigation";

import { serializeDetailPeriod } from "./search-params";

type LinkedListing = {
  slug: string;
  availability: {
    bookablePeriod: { checkIn: string; checkOut: string } | null;
    nextPeriod: { checkIn: string; checkOut: string } | null;
  };
};

/**
 * A yacht page link opening on the charter this boat sells first: the stored one, or the next one
 * where that lapsed. For the cards with no searched period of their own to carry.
 */
export function listingDetailHref(listing: LinkedListing): AppPathname {
  const period = listing.availability.bookablePeriod ?? listing.availability.nextPeriod;
  /* SAFETY: `/yachts/[id]` is a real route; typedRoutes only recognises the literal segment, and
     nuqs serializes the query string back to a plain string. */
  return serializeDetailPeriod(`/yachts/${listing.slug}`, {
    checkIn: period?.checkIn ?? null,
    checkOut: period?.checkOut ?? null,
  }) as AppPathname;
}
