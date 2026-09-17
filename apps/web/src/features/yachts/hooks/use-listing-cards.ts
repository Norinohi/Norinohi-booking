"use client";

import { useTranslations } from "next-intl";

import { useDisplayCurrency } from "@/components/layout/currency-provider";
import { useMoney } from "@/hooks/use-money";

import { type CharterPeriod, type ResultListing, toYachtCard } from "../lib/to-yacht-card";
import { usePriceBasis } from "@/components/shared/form/filters";

export function useListingCards() {
  const t = useTranslations("Common.boatCard");
  const tCrew = useTranslations("Common.crewTypes");
  const tBadge = useTranslations("Common.boatCard.badges");
  const formatMoney = useMoney();
  const { basis } = usePriceBasis();
  const { display } = useDisplayCurrency();

  /*
   * `period` is the charter the result is about, which only a dated search has. The card used
   * to print one hardcoded week for every listing regardless of what was searched, so a
   * 14-night October search still read "July 7 - July 14". No period, no dates.
   */
  function toCard(listing: ResultListing, period?: CharterPeriod, datesInCaption = false) {
    return toYachtCard(
      t,
      tCrew,
      tBadge,
      formatMoney,
      listing,
      period,
      basis,
      display === null,
      datesInCaption,
    );
  }

  return { toCard };
}
