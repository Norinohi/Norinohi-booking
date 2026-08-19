import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import type { useTranslations } from "next-intl";

import type { BoatCardProps } from "@/components/shared/data-display/boat-card";
import type { AppPathname } from "@/i18n/navigation";
import { boatCardIdentity, boatCardPrice } from "@/lib/boat-card-fields";

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
  formatMoney: (amountMinor: number) => string,
  listing: ResultListing,
  period?: CharterPeriod,
): BoatCardProps & { id: string } {
  const unavailable = !listing.availability.hasAvailableDates;

  return {
    ...boatCardIdentity(t, listing),
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
    ...(period?.checkIn && period.checkOut
      ? {
          start: { day: period.checkIn, time: listing.base.checkInTime },
          end: { day: period.checkOut, time: listing.base.checkOutTime },
        }
      : /* No charter to show, so the card offers the day one could start instead. */
        { availableFrom: listing.availability.bookableFrom ?? undefined }),
    priceLabel: t("priceFor", { days: listing.priceDetails.periodDays }),
    price: boatCardPrice(t, listing, formatMoney),
    priceIsLabel: !listing.priceFrom,
    perPerson:
      listing.priceDetails.perPersonMinor != null
        ? t("perPerson", { price: formatMoney(listing.priceDetails.perPersonMinor) })
        : "",
    note: listing.priceDetails.securityDeposit
      ? {
          label: t("securityDeposit", {
            amount: formatMoney(listing.priceDetails.securityDeposit.amountMinor),
          }),
          tooltip: t("securityDepositInfo"),
        }
      : null,
  };
}
