import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { createElement } from "react";

import type { BoatCardProps } from "@/components/shared/data-display/boat-card";
import { useMoney } from "@/hooks/use-money";
import { slugToLabel } from "@/lib/slug-to-label";

import type { BookingSummary } from "../types";

/*
 * HARDCODED — booking.list does not return these fields, yet the tablet/mobile card is the full
 * search BoatCard (Figma) which needs them. Every value here is a fixed placeholder until the
 * backend adds the field to booking.list. This block is the single source of the "what the
 * backend still owes booking.list" list handed off with this migration; keep it in sync.
 *
 *   listing.specs        — yearBuilt, berths, heads, cabins, lengthM, sailType   (all placeholder)
 *   listing.amenities    — amenity codes                                          (placeholder)
 *   listing.bookingStats — bookedThisMonth, viewedToday                           (placeholder)
 *   listing.badges       — best value / deposit insurance / top rated            (dropped → none)
 *   base.address         — street address for the marina popover                  (placeholder)
 *   base.coordinates     — lat/lng for the marina map thumbnail                   (placeholder)
 *   base.timeZone        — the zone check-in/out times are rendered in            (placeholder)
 *   base.phone/website/email — marina contact rows                                (omitted)
 */
const PLACEHOLDER = {
  specs: { yearBuilt: 2022, berths: 8, heads: 2, cabins: 3, lengthM: 12.8, sailType: "batten_mainsail" },
  amenities: ["wifi", "solar", "paddle"],
  stats: { bookedThisMonth: 3, viewedToday: 42 },
  address: "Marina address unavailable",
  coordinates: { lat: 43.508, lng: 16.44 },
  timeZone: "UTC",
} as const;

const days = (checkIn: string, checkOut: string) =>
  Math.max(
    1,
    Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000),
  );

/**
 * Maps a `booking.list` row to the shared BoatCard props. Real booking data fills the dates,
 * price, title, marina name and imagery; the boat spec sheet the card also shows is filled from
 * `PLACEHOLDER` above until booking.list carries it. Mirrors `useListingCards().toCard`.
 */
export function useBookingCards() {
  const t = useTranslations("Common.boatCard");
  const formatMoney = useMoney();

  function toBookingCard(booking: BookingSummary): BoatCardProps {
    const gallery = booking.listing.gallery.length
      ? booking.listing.gallery
      : booking.listing.mainImage
        ? [booking.listing.mainImage]
        : [];

    return {
      id: booking.listing.id,
      detailHref: `/yachts/${booking.listing.id}`,
      images: gallery,
      imageAlt: t("imageAlt", { name: booking.listing.title, marina: booking.base.name }),
      badges: [],
      marina: {
        id: booking.listing.id,
        name: booking.base.name,
        address: PLACEHOLDER.address,
        city: booking.base.locationName,
        country: booking.base.countryName,
        coordinates: PLACEHOLDER.coordinates,
      },
      name: booking.listing.title,
      rating: String(booking.listing.rating),
      charterType: booking.listing.category ?? "",
      crew: booking.listing.crewType ? slugToLabel(booking.listing.crewType) : "",
      specs: [
        { label: t("specs.year"), value: String(PLACEHOLDER.specs.yearBuilt) },
        { label: t("specs.people"), value: String(PLACEHOLDER.specs.berths) },
        { label: t("specs.toilets"), value: String(PLACEHOLDER.specs.heads) },
        { label: t("specs.baths"), value: String(PLACEHOLDER.specs.heads) },
        { label: t("specs.mainsail"), value: slugToLabel(PLACEHOLDER.specs.sailType) },
        { label: t("specs.cabins"), value: String(PLACEHOLDER.specs.cabins) },
        { label: t("specs.length"), value: `${PLACEHOLDER.specs.lengthM} m` },
      ],
      amenities: PLACEHOLDER.amenities.map((amenity) => ({
        icon: createElement(Check),
        label: amenity,
      })),
      stats: [
        t("stats.booked", { count: PLACEHOLDER.stats.bookedThisMonth }),
        t("stats.viewed", { count: PLACEHOLDER.stats.viewedToday }),
      ],
      start: booking.checkIn,
      end: booking.checkOut,
      timeZone: PLACEHOLDER.timeZone,
      priceLabel: t("priceFor", { days: days(booking.checkIn, booking.checkOut) }),
      price: formatMoney(booking.total.amountMinor),
      perPerson:
        booking.guests > 0
          ? t("perPerson", {
              price: formatMoney(Math.round(booking.total.amountMinor / booking.guests)),
            })
          : "",
      prepayment: t("prepayment", { amount: formatMoney(booking.paidTotal.amountMinor) }),
    };
  }

  return { toBookingCard };
}
