import { placeLine } from "@yacht-charter/api/lib/place-line";
import { serializeDetailPeriod } from "@/features/yachts";
import type { AppPathname } from "@/i18n/navigation";
import { type BadgeTranslator, badgeLabel } from "@/lib/badge-label";

import type { PlannerRecommendation } from "../types";

export type RecommendedListing = NonNullable<PlannerRecommendation["listing"]>;

/** Maps the recommended listing onto `BoatSmallCard`'s props — real inventory, not a placeholder. */
export function toBoatCardProps(
  tBadge: BadgeTranslator,
  listing: RecommendedListing,
  priceText: string,
  countryLabel: string,
  period: PlannerRecommendation["period"],
) {
  return {
    id: listing.id,
    image: listing.mainImage,
    imageAlt: listing.title,
    location: placeLine(listing.base.name, countryLabel),
    title: listing.title,
    // Same rule as the catalogue card: an unrated listing shows no star, not a gold zero.
    rating: listing.rating > 0 ? listing.rating : undefined,
    tags: listing.badges.slice(0, 2).map((badge) => ({ label: badgeLabel(tBadge, badge) })),
    price: priceText,
    /* The trip's own length, so the yacht page opens on the charter the quiz was answered for.
       SAFETY: `/yachts/[id]` is a real route; typedRoutes only recognises the literal segment. */
    detailHref: serializeDetailPeriod(`/yachts/${listing.slug}`, {
      checkIn: period?.checkIn ?? null,
      checkOut: period?.checkOut ?? null,
    }) as AppPathname,
  };
}
