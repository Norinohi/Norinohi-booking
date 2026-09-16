import { placeLine } from "@yacht-charter/api/lib/place-line";

import type { YachtTileData } from "@/components/shared/data-display/yacht-card/types";
import { toYachtTile } from "@/components/shared/data-display/yacht-card/view-model";
import { serializeDetailPeriod } from "@/features/yachts";
import type { AppPathname } from "@/i18n/navigation";
import { type BadgeTranslator, badgeLabel } from "@/lib/badge-label";

import type { PlannerRecommendation } from "../types";

export type RecommendedListing = NonNullable<PlannerRecommendation["listing"]>;

/** The recommended listing as a tile: real inventory, not a placeholder. */
export function toRecommendedTile(
  tBadge: BadgeTranslator,
  listing: RecommendedListing,
  countryLabel: string,
  period: PlannerRecommendation["period"],
  pricing: Pick<YachtTileData, "price" | "priceLabel" | "priceSuffix" | "actionLabel">,
): YachtTileData {
  return toYachtTile(listing, {
    imageSizes: "334px",
    location: placeLine(listing.base.name, countryLabel),
    tags: listing.badges.slice(0, 2).map((badge) => ({ label: badgeLabel(tBadge, badge) })),
    /* The trip's own length, so the yacht page opens on the charter the quiz was answered for.
       SAFETY: `/yachts/[id]` is a real route; typedRoutes only recognises the literal segment. */
    detailHref: serializeDetailPeriod(`/yachts/${listing.slug}`, {
      checkIn: period?.checkIn ?? null,
      checkOut: period?.checkOut ?? null,
    }) as AppPathname,
    ...pricing,
  });
}
