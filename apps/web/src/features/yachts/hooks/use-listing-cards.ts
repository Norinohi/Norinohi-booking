"use client";

import { useTranslations } from "next-intl";

import { useMoney } from "@/hooks/use-money";

import type { MapBoatCardProps } from "../components/map/map-boat-card";
import { type CharterPeriod, type ResultListing, toBoatCard } from "../lib/to-boat-card";

export function useListingCards() {
  const t = useTranslations("Common.boatCard");
  const formatMoney = useMoney();

  /*
   * `period` is the charter the result is about, which only a dated search has. The card used
   * to print one hardcoded week for every listing regardless of what was searched, so a
   * 14-night October search still read "July 7 - July 14". No period, no dates.
   */
  function toCard(listing: ResultListing, period?: CharterPeriod) {
    return toBoatCard(t, formatMoney, listing, period);
  }

  function toMapCard(
    listing: ResultListing,
    period?: CharterPeriod,
  ): MapBoatCardProps & { id: string } {
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
      note: card.note,
    };
  }

  return { toCard, toMapCard };
}
