import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import type { useTranslations } from "next-intl";

import type { BoatCardProps } from "@/components/shared/data-display/boat-card";
import type { AppPathname } from "@/i18n/navigation";
import {
  AVAILABILITY_TONE,
  availabilityLabel,
  availabilityStatus,
} from "@/lib/availability-status";
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
export type CharterPeriod = {
  checkIn: string | null;
  checkOut: string | null;
  /* Set by the search results when the dates are the boat's own charter, not the searched one. */
  periodIsAlternative?: boolean;
};

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
  const status = availabilityStatus({
    hasAvailableDates: listing.availability.hasAvailableDates,
    hasBookablePeriod: listing.availability.bookablePeriod !== null,
    priceIsFrom: listing.priceIsFrom,
  });
  const statusBadge = {
    label: availabilityLabel(tBadge, status),
    tone: AVAILABILITY_TONE[status],
  };
  /* The currency the provider published in, which the per-person figure is a share of. */
  const currency = listing.priceFrom?.currency ?? listing.priceDetails.securityDeposit?.currency;
  /* An undated search still sends a period, both ends null; that is no period at all. */
  const searched = period?.checkIn && period.checkOut ? period : null;

  const identity = boatCardIdentity(t, tCrew, tBadge, listing);

  return {
    ...identity,
    /*
     * The availability status leads the badge row: whether the boat can be booked at all outranks
     * anything we are promoting about it. An unbookable yacht has nothing left to promote, so
     * there the status is the only chip.
     */
    badges: unavailable ? [statusBadge] : [statusBadge, ...identity.badges],
    ...(unavailable ? { unavailable } : null),
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
     * The API swaps in the boat's own sellable charter when the searched window is one this
     * listing's turnaround rules refuse, so the dates above are then not the ones asked for.
     * Unlabelled, the card looks like it ignored the search.
     */
    datesNote: period?.periodIsAlternative ? t("datesAlternative") : undefined,
    priceLabel: priceCaption(t, listing),
    /* "From" reads into the amount; "Price for 7 days" captions it. */
    priceLabelLeads: listing.priceIsFrom,
    price: boatCardPrice(t, listing, formatMoney),
    listPrice: boatCardListPrice(listing, formatMoney),
    priceIsLabel: !listing.priceFrom,
    /*
     * Divided by berths, because a card has no party size to divide by. The detail page does
     * have one and divides by that, so the same yacht read €158 here and €633 there with
     * nothing on either screen saying which. Naming the base is what reconciles them.
     */
    perPerson:
      listing.priceDetails.perPersonMinor != null
        ? t("perBerth", {
            price: formatMoney(listing.priceDetails.perPersonMinor, currency),
            berths: listing.specs.berths,
          })
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

/**
 * The caption above the amount, and nothing at all when there is no amount.
 *
 * Both captions introduce a figure: "From" reads into it, "Price for 7 days" names what it
 * buys. With no published rate the slot holds a word instead — "On request" — and captioning
 * that produced "From / On request", which reads as a broken sentence rather than as a price.
 */
function priceCaption(t: CardTranslator, listing: ResultListing): string {
  if (!listing.priceFrom) return "";
  if (listing.priceIsFrom) return t("priceFromLabel");
  return t("priceFor", { days: listing.priceDetails.periodDays });
}

function charterDates(listing: ResultListing, period: CharterPeriod | null) {
  if (!period?.checkIn || !period.checkOut) return null;
  return {
    start: { day: period.checkIn, time: listing.base.checkInTime },
    end: { day: period.checkOut, time: listing.base.checkOutTime },
  };
}
