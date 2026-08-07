import type { Route } from "next";

import type { PlannerRecommendation } from "../types";

export type RecommendedListing = NonNullable<PlannerRecommendation["listing"]>;

/** Maps the recommended listing onto `BoatSmallCard`'s props — real inventory, not a placeholder. */
export function toBoatCardProps(
  listing: RecommendedListing,
  formatMoney: (amountMinor: number) => string,
) {
  return {
    id: listing.id,
    image: listing.mainImage,
    imageAlt: listing.title,
    location: `${listing.base.name}, ${listing.base.country}`,
    title: listing.title,
    rating: listing.rating,
    tags: listing.badges.slice(0, 2).map((badge) => ({ label: badge.label })),
    price: formatMoney(listing.priceFrom.amountMinor),
    detailHref: `/yachts/${listing.slug}` as Route,
  };
}
