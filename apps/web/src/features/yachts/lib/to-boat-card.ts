import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import type { useTranslations } from "next-intl";

import type { BoatCardProps } from "@/components/shared/data-display/boat-card";
import type { AppPathname } from "@/i18n/navigation";
import {
  boatCardIdentity,
  boatCardListPrice,
  boatCardPrice,
  type MoneyFormatter,
} from "@/lib/boat-card-fields";
import type { BadgeTranslator } from "@/lib/badge-label";
import type { CrewTranslator } from "@/lib/crew-label";

import { serializeDetailPeriod } from "./search-params";
import { toMarina } from "./to-marina";

type ResultsOutput = Awaited<ReturnType<AppRouterClient["charterSearch"]["results"]>>;
export type ResultListing = ResultsOutput["items"][number]["listing"];

/** The searched charter, carried beside the listing on every result item; null on an undated search. */
export type CharterPeriod = { checkIn: string | null; checkOut: string | null };

type CardTranslator = ReturnType<typeof useTranslations<"Common.boatCard">>;

/**
 * A listing as card props.
 *
 * Pure, and given its translator rather than calling a hook, because both a client screen and a
 * server-rendered facet page build the same card. A facet page has to put its boats in the
 * HTML itself — anything behind a Suspense boundary never reaches a crawler — so this could not
 * stay inside `useListingCards`.
 */
export function toBoatCard(
  t: CardTranslator,
  tCrew: CrewTranslator,
  tBadge: BadgeTranslator,
  formatMoney: MoneyFormatter,
  listing: ResultListing,
  period?: CharterPeriod,
): BoatCardProps & { id: string } {
  const unavailable = !listing.availability.hasAvailableDates;
  /* The currency the provider published in, which the per-person figure is a share of. */
  const currency = listing.priceFrom?.currency ?? listing.priceDetails.securityDeposit?.currency;
  /* An undated search still sends a period, both ends null; that is no period at all. */
  const searched = period?.checkIn && period.checkOut ? period : null;

  return {
    ...boatCardIdentity(t, tCrew, tBadge, listing),
    /* An unbookable yacht has nothing to sell, so the tag replaces the promotional badges. */
    ...(unavailable
      ? { unavailable, badges: [{ label: t("badges.unavailable"), muted: true }] }
      : null),
    imageAlt: t("imageAlt", { name: listing.title, marina: listing.base.name }),
    /* SAFETY: `/yachts/[id]` is a real route; typedRoutes only recognises it when the segment
       is a literal, and nuqs serializes the query string back to a plain string. */
    detailHref: serializeDetailPeriod(`/yachts/${listing.slug}`, {
      checkIn: period?.checkIn ?? null,
      checkOut: period?.checkOut ?? null,
    }) as AppPathname,
    marina: toMarina(listing.base),
    /*
     * The searched charter, or on an undated search the first one this boat would sell. Both
     * print as the same pair of dates, which is the point: a card that named only a start day
     * left the customer to guess the length, and the day it named was not one the detail
     * calendar could always honour.
     */
    ...charterDates(listing, searched ?? listing.availability.bookablePeriod),
    /*
     * "From" where the figure is the season's cheapest week rather than the price of the
     * charter named above it. Captioning an indicative floor "Price for 7 days" prices a week
     * nobody has quoted, which is the mislabel this pair exists to avoid.
     */
    priceLabel: listing.priceIsFrom
      ? t("priceFromLabel")
      : t("priceFor", { days: listing.priceDetails.periodDays }),
    /* "From" reads into the amount; "Price for 7 days" captions it. */
    priceLabelLeads: listing.priceIsFrom,
    price: boatCardPrice(t, listing, formatMoney),
    listPrice: boatCardListPrice(listing, formatMoney),
    priceIsLabel: !listing.priceFrom,
    perPerson:
      listing.priceDetails.perPersonMinor != null
        ? t("perPerson", { price: formatMoney(listing.priceDetails.perPersonMinor, currency) })
        : "",
    note: listing.priceDetails.securityDeposit
      ? {
          label: t("securityDeposit", {
            amount: formatMoney(
              listing.priceDetails.securityDeposit.amountMinor,
              listing.priceDetails.securityDeposit.currency,
            ),
          }),
          tooltip: t("securityDepositInfo"),
        }
      : null,
  };
}

function charterDates(listing: ResultListing, period: CharterPeriod | null) {
  if (!period?.checkIn || !period.checkOut) return null;
  return {
    start: { day: period.checkIn, time: listing.base.checkInTime },
    end: { day: period.checkOut, time: listing.base.checkOutTime },
  };
}
