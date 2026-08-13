"use client";

import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import { useTranslations } from "next-intl";

import type { BoatCardProps } from "@/components/shared/data-display/boat-card";
import { boatCardIdentity, boatCardPrice } from "@/lib/boat-card-fields";
import { useMoney } from "@/hooks/use-money";

import type { MapBoatCardProps } from "../components/map/map-boat-card";
import { toMarina } from "../lib/to-marina";

type ResultsOutput = Awaited<ReturnType<AppRouterClient["charterSearch"]["results"]>>;
type ResultItem = ResultsOutput["items"][number];
type Listing = ResultItem["listing"];

// TODO: hardcoded until results return UTC ISO check-in/out + base.timeZone.
const PLACEHOLDER_DATES = {
  start: "2026-07-07T15:00:00Z",
  end: "2026-07-14T07:00:00Z",
  timeZone: "Europe/Zagreb",
};

export function useListingCards() {
  const t = useTranslations("Common.boatCard");
  const formatMoney = useMoney();

  function toCard(listing: Listing): BoatCardProps & { id: string } {
    const unavailable = !listing.availability.hasAvailableDates;

    return {
      ...boatCardIdentity(t, listing),
      /* An unbookable yacht has nothing to sell, so the tag replaces the promotional badges. */
      ...(unavailable
        ? { unavailable, badges: [{ label: t("badges.unavailable"), muted: true }] }
        : null),
      imageAlt: t("imageAlt", { name: listing.title, marina: listing.base.name }),
      detailHref: `/yachts/${listing.slug}`,
      marina: toMarina(listing.base),
      start: PLACEHOLDER_DATES.start,
      end: PLACEHOLDER_DATES.end,
      timeZone: PLACEHOLDER_DATES.timeZone,
      priceLabel: t("priceFor", { days: listing.priceDetails.periodDays }),
      price: boatCardPrice(t, listing, formatMoney),
      priceIsLabel: !listing.priceFrom,
      perPerson:
        listing.priceDetails.perPersonMinor != null
          ? t("perPerson", { price: formatMoney(listing.priceDetails.perPersonMinor) })
          : "",
      prepayment: listing.priceDetails.bookingPrepayment
        ? t("prepayment", {
            amount: formatMoney(listing.priceDetails.bookingPrepayment.amountMinor),
          })
        : "",
    };
  }

  function toMapCard(listing: Listing): MapBoatCardProps & { id: string } {
    const card = toCard(listing);
    return {
      id: card.id,
      detailHref: card.detailHref,
      images: card.images,
      imageAlt: card.imageAlt,
      badges: card.badges,
      marina: card.marina,
      name: card.name,
      rating: card.rating,
      charterType: card.charterType,
      crew: card.crew,
      priceLabel: card.priceLabel,
      price: card.price,
      perPerson: card.perPerson,
      prepayment: card.prepayment,
    };
  }

  return { toCard, toMapCard };
}
