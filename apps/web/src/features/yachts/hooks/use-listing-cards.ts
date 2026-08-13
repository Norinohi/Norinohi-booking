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
/** The searched charter, carried beside the listing on every result item; null on an undated search. */
type CharterPeriod = { checkIn: string | null; checkOut: string | null };

export function useListingCards() {
  const t = useTranslations("Common.boatCard");
  const formatMoney = useMoney();

  /*
   * `period` is the charter the result is about, which only a dated search has. The card used
   * to print one hardcoded week for every listing regardless of what was searched, so a
   * 14-night October search still read "July 7 - July 14". No period, no dates.
   */
  function toCard(listing: Listing, period?: CharterPeriod): BoatCardProps & { id: string } {
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
      ...(period?.checkIn && period.checkOut
        ? {
            start: { day: period.checkIn, time: listing.base.checkInTime },
            end: { day: period.checkOut, time: listing.base.checkOutTime },
          }
        : null),
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

  function toMapCard(listing: Listing, period?: CharterPeriod): MapBoatCardProps & { id: string } {
    const card = toCard(listing, period);
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
