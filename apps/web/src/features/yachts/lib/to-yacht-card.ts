import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import type { useTranslations } from "next-intl";

import type { AppPathname } from "@/i18n/navigation";
import {
  AVAILABILITY_TONE,
  availabilityLabel,
  availabilityStatus,
} from "@/lib/availability-status";
import type { YachtCardData } from "@/components/shared/data-display/yacht-card/types";
import {
  type MoneyFormatter,
  yachtCardExtras,
  yachtCardIdentity,
  yachtCardListPrice,
  yachtCardPrice,
} from "@/components/shared/data-display/yacht-card/view-model";
import type { BadgeTranslator } from "@/lib/badge-label";
import type { CrewTranslator } from "@/lib/crew-label";
import { dayToDisplay } from "@/lib/date";

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
 * HTML itself (anything behind a Suspense boundary never reaches a crawler), so this could not
 * stay inside `useListingCards`.
 */
export function toYachtCard(
  t: CardTranslator,
  tCrew: CrewTranslator,
  tBadge: BadgeTranslator,
  formatMoney: MoneyFormatter,
  listing: ResultListing,
  period?: CharterPeriod,
  /** Which price `priceFrom` is. Inferred from the listing's two prices when not given. */
  basis?: "base" | "all_in",
  /**
   * Whether prices stay in the currency each vendor published, so a card in another currency
   * than the comparison one adds that figure. Off where the visitor's display currency converts
   * every card already.
   */
  publishedCurrencies = false,
  /**
   * Whether the caption names the priced charter's dates rather than its length. The map's cards
   * print no dates of their own, so "7 days" there named a week nobody could see.
   */
  datesInCaption = false,
): YachtCardData & { id: string } {
  const hold = listing.availability.temporaryHold;
  /* An undated search still sends a period, both ends null; that is no period at all. */
  const searched = period?.checkIn && period.checkOut ? period : null;
  const unavailable = !listing.availability.hasAvailableDates;
  const status = availabilityStatus({
    hasAvailableDates: listing.availability.hasAvailableDates,
    /* Dates on the card are a charter this boat sells: the searched one, or the nearest of the
       searched length. They count even where the stored first charter has lapsed. */
    hasBookablePeriod:
      listing.availability.bookablePeriod !== null ||
      listing.availability.nextPeriod !== null ||
      searched !== null,
    temporarilyHeld: hold !== null,
  });
  const statusBadge = {
    label: availabilityLabel(tBadge, status),
    tone: AVAILABILITY_TONE[status],
  };

  const identity = yachtCardIdentity(t, tCrew, tBadge, listing);
  const captionPeriod = datesInCaption
    ? (searched ?? listing.availability.bookablePeriod)
    : period?.periodIsAlternative
      ? searched
      : null;

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
    /* Says what the badge above it leaves out: how long the other customer's hold has left. */
    hold: hold ?? undefined,
    ...priceCaption(t, listing, basis, captionPeriod),
    price: yachtCardPrice(t, listing, formatMoney),
    listPrice: yachtCardListPrice(listing, formatMoney),
    /* Only ever present where the headline is the charter rate, which is what makes the line
       self-explanatory: it appears exactly when there is something the price does not include. */
    priceExtras: yachtCardExtras(t, listing, formatMoney),
    priceIsLabel: !listing.priceFrom,
    ...onRequestPrompt(t, listing, formatMoney),
    /*
     * The nightly rate, which is what "Price: low to high" orders on. The amounts above it price
     * charters of different lengths - three nights on one hull, a week on the next - so ordering
     * them against each other only makes sense per night, and the sequence only reads as a
     * sequence if the figure it was sorted by is on the card. `periodDays` is the same night
     * count the sort divides by.
     *
     * It replaces the per-person line rather than joining it. A catalogue card has no party size,
     * so that figure divided by berths - what each guest pays only if the boat sails full, which
     * is not how most parties book. Beside a EUR 670 total, "EUR 168 per person in 4 berths" read
     * as a fourth price rather than as the same one rearranged, and naming the base did not
     * rescue it. The detail page keeps its own per-person line, where a party size is actually
     * chosen and the division answers something.
     *
     * Not on a single night, where dividing by one prints the amount immediately above it again
     * under a different word - "EUR 2,282 / EUR 2,282 per night". The reason for the line
     * survives that: on a one-night charter the figure the sort used *is* the headline amount,
     * so it is already on the card and the sequence still reads as one. These were rare until
     * the lead-time floor let a one-night charter reach a card at all.
     */
    perNight: perNightLine(t, formatMoney, listing, publishedCurrencies),
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

/*
 * The per-night figure, and beside a price in another currency its EUR equivalent: the price
 * sorts compare every card in EUR, so "4,700 USD" before "4,076 EUR" is in order only once the
 * card says what it was ordered by.
 */
function perNightLine(
  t: CardTranslator,
  formatMoney: MoneyFormatter,
  listing: ResultListing,
  publishedCurrencies: boolean,
): string | undefined {
  const nights = listing.priceDetails.periodDays;
  if (!listing.priceFrom || nights <= 1) return undefined;
  const price = formatMoney(
    Math.round(listing.priceFrom.amountMinor / nights),
    listing.priceFrom.currency,
  );
  const comparable = publishedCurrencies ? listing.comparablePriceFrom : null;
  if (!comparable) return t("perNight", { price });
  return t("perNightWithEquivalent", {
    price,
    equivalent: formatMoney(Math.round(comparable.amountMinor / nights), comparable.currency),
  });
}

/**
 * The caption above the amount, and nothing at all when there is no amount.
 *
 * Both captions introduce a figure: "From" reads into it, "Price for 7 days" names what it
 * buys. With no published rate the slot holds a word instead, "On request", and captioning
 * that produced "From / On request", which reads as a broken sentence rather than as a price.
 *
 * `otherDates` is the charter a flexible search moved the card onto, which the API priced. The
 * caption names it, so the figure cannot pass for a price of the dates that were searched. A map
 * card passes its priced charter here too, having no dates line to show it on.
 */
function priceCaption(
  t: CardTranslator,
  listing: ResultListing,
  basis: "base" | "all_in" | undefined,
  otherDates: CharterPeriod | null,
): PriceCaption {
  if (!listing.priceFrom) return { priceLabel: "" };
  const boat = isBoatPrice(listing, basis);
  const listCaption = isListPriceSource(listing.priceSource)
    ? LIST_CAPTIONS[listing.priceSource]
    : null;
  if (!listing.priceIsFrom && otherDates?.checkIn && otherDates.checkOut) {
    const dates = { from: dayToDisplay(otherDates.checkIn), to: dayToDisplay(otherDates.checkOut) };
    if (listCaption) return withHint(listCaption.forPeriod(t, boat, dates));
    return { priceLabel: t(boat ? "boatPriceForPeriod" : "priceForPeriod", dates) };
  }
  if (listing.priceIsFrom) {
    return { priceLabel: t(boat ? "boatPriceIndicative" : "priceIndicative") };
  }
  if (listCaption) {
    return withHint(listCaption.forNights(t, boat, listing.priceDetails.periodDays));
  }
  return {
    priceLabel: t(boat ? "boatPriceFor" : "priceFor", { days: listing.priceDetails.periodDays }),
  };
}

/*
 * A list-price caption runs to four lines in the narrow price column, so only its name stays on
 * the card and the qualifiers after " · " move into a tooltip. Every locale writes that separator.
 */
function withHint(caption: string): PriceCaption {
  const at = caption.indexOf(" · ");
  if (at === -1) return { priceLabel: caption };
  const hint = caption.slice(at + 3);
  return {
    priceLabel: caption.slice(0, at),
    priceHint: hint.charAt(0).toUpperCase() + hint.slice(1),
  };
}

/*
 * A card with dates the yacht sells but no price for them: the yacht page quotes the vendor live,
 * so the card sends the visitor there. A week's figure, where there is one, stands in the price
 * slot as a week "from", so the budget is legible without passing for these dates' price.
 */
function onRequestPrompt(
  t: CardTranslator,
  listing: ResultListing,
  formatMoney: MoneyFormatter,
): Partial<Pick<YachtCardData, "getPrice" | "price" | "priceLabel">> {
  if (listing.priceFrom || !listing.availability.hasAvailableDates) return {};
  const weekly = listing.weeklyPriceFrom;
  if (!weekly) return { getPrice: true };
  return {
    getPrice: true,
    price: t("weeklyPriceFrom", { price: formatMoney(weekly.amountMinor, weekly.currency) }),
    priceLabel: t("priceForDatesOnPage"),
  };
}

/** The card's price caption, and the qualifiers moved out of it into a tooltip. */
type PriceCaption = Pick<YachtCardData, "priceLabel" | "priceHint">;

type PriceSource = NonNullable<ResultListing["priceSource"]>;
type ListPriceSource = Exclude<PriceSource, "vendor" | "season-minimum">;
type CaptionDates = { from: Date; to: Date };

interface ListCaption {
  forNights(t: CardTranslator, boat: boolean, nights: number): string;
  forPeriod(t: CardTranslator, boat: boolean, dates: CaptionDates): string;
}

function isListPriceSource(source: ResultListing["priceSource"]): source is ListPriceSource {
  return source !== null && source !== "vendor" && source !== "season-minimum";
}

/*
 * A figure from the operator's list, captioned by what the quote can do to it: a week's list rate
 * and a NauSYS estimate beyond a week can only come down, a NauSYS estimate under a week is a
 * starting price, and a Booking Manager estimate can move either way.
 */
const LIST_CAPTIONS = {
  "price-list": {
    forNights: (t, boat) => t(boat ? "boatPriceListRateMayBeLower" : "priceListRateMayBeLower"),
    forPeriod: (t, boat, dates) =>
      t(boat ? "boatPriceListRateMayBeLowerForPeriod" : "priceListRateMayBeLowerForPeriod", dates),
  },
  "price-list-estimate": {
    forNights: (t, boat, nights) =>
      t(boat ? "boatPriceListEstimate" : "priceListEstimate", { nights }),
    forPeriod: (t, boat, dates) =>
      t(boat ? "boatPriceListEstimateForPeriod" : "priceListEstimateForPeriod", dates),
  },
  "price-list-estimate-from": {
    forNights: (t, boat, nights) =>
      t(boat ? "boatPriceListEstimateFrom" : "priceListEstimateFrom", { nights }),
    forPeriod: (t, boat, dates) =>
      t(boat ? "boatPriceListEstimateFromForPeriod" : "priceListEstimateFromForPeriod", dates),
  },
  "price-list-estimate-before-discounts": {
    forNights: (t, boat, nights) =>
      t(boat ? "boatPriceListEstimateMayBeLower" : "priceListEstimateMayBeLower", { nights }),
    forPeriod: (t, boat, dates) =>
      t(
        boat ? "boatPriceListEstimateMayBeLowerForPeriod" : "priceListEstimateMayBeLowerForPeriod",
        dates,
      ),
  },
} satisfies Record<ListPriceSource, ListCaption>;

/*
 * A boat with no obligatory pack costs the same either way, so it keeps the basis it was asked
 * for; only a server-rendered card with no basis to hand reads it off the two figures.
 */
function isBoatPrice(listing: ResultListing, basis: "base" | "all_in" | undefined): boolean {
  /* No usable rate (none published, or a nominal one): the figure is the all-in price. */
  if (!listing.basePriceFrom) return false;
  if (basis) return basis === "base";
  const base = listing.basePriceFrom?.amountMinor;
  return (
    base !== undefined &&
    listing.priceFrom?.amountMinor === base &&
    listing.allInPriceFrom?.amountMinor !== base
  );
}

function charterDates(listing: ResultListing, period: CharterPeriod | null) {
  if (!period?.checkIn || !period.checkOut) return null;
  return {
    start: { day: period.checkIn, time: listing.base.checkInTime },
    end: { day: period.checkOut, time: listing.base.checkOutTime },
  };
}
