import { placeLine } from "@yacht-charter/api/lib/place-line";
import { type BadgeTranslator, badgeLabel } from "@/lib/badge-label";

import type { PlannerRecommendation } from "../types";

export type RecommendedListing = NonNullable<PlannerRecommendation["listing"]>;

/** Maps the recommended listing onto `BoatSmallCard`'s props — real inventory, not a placeholder. */
export function toBoatCardProps(
  tBadge: BadgeTranslator,
  listing: RecommendedListing,
  priceText: string,
) {
  return {
    id: listing.id,
    image: listing.mainImage,
    imageAlt: listing.title,
    location: placeLine(listing.base.name, listing.base.country),
    title: listing.title,
    // Same rule as the catalogue card: an unrated listing shows no star, not a gold zero.
    rating: listing.rating > 0 ? listing.rating : undefined,
    tags: listing.badges.slice(0, 2).map((badge) => ({ label: badgeLabel(tBadge, badge) })),
    price: priceText,
    detailHref: `/yachts/${listing.slug}`,
  };
}
