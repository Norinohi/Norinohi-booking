import { useTranslations } from "next-intl";

import type {
  BoatCardCharterDate,
  BoatCardProps,
} from "@/components/shared/data-display/boat-card";
import { boatCardIdentity } from "@/lib/boat-card-fields";
import type { Marina } from "@/components/shared/overlay/marina-popover";
import { useMoney } from "@/hooks/use-money";

import type { BookingSummary } from "../types";

const days = (checkIn: string, checkOut: string) =>
  Math.max(
    1,
    Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000),
  );

/*
 * booking.list's base carries the same values as the search base under different field names
 * (address/locationName/countryName/coordinates vs region/location/country/lat/lng), so this maps
 * them separately from yachts' `toMarina`. No base id, so the listing id stands in.
 */
function toMarina(id: string, base: BookingSummary["base"]): Marina {
  return {
    id,
    name: base.name,
    address: base.address,
    city: base.locationName,
    country: base.countryName,
    phone: base.phone ?? undefined,
    website: base.website ?? undefined,
    email: base.email ?? undefined,
    coordinates: base.coordinates,
  };
}

/**
 * Maps a `booking.list` row to the shared BoatCard props. The boat identity comes from the frozen
 * `listing` snapshot (shared with the catalogue via `boatCardIdentity`); the dates, total, marina,
 * per-person and prepayment come from the booking itself.
 */
/*
 * `checkIn`/`checkOut` are a charter day stamped with the base's local time and pinned to UTC
 * by `combine` in services/booking.ts, so slicing recovers exactly what went in. They are
 * wall-clock at the marina, never a real instant — the booking's `base.timeZone` is the
 * hardcoded "UTC" that keeps them from shifting.
 */
function charterStamp(iso: string): BoatCardCharterDate {
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) || null };
}

export function useBookingCards() {
  const t = useTranslations("Common.boatCard");
  const formatMoney = useMoney();

  function toBookingCard(booking: BookingSummary): BoatCardProps {
    return {
      ...boatCardIdentity(t, booking.listing),
      imageAlt: t("imageAlt", { name: booking.listing.title, marina: booking.base.name }),
      /* The booking, not the listing: this card is history, and the yacht page cannot say
         what was paid, what is owed, or where the invoice is. */
      detailHref: `/bookings/${booking.id}`,
      marina: toMarina(booking.listing.id, booking.base),
      start: charterStamp(booking.checkIn),
      end: charterStamp(booking.checkOut),
      priceLabel: t("priceFor", { days: days(booking.checkIn, booking.checkOut) }),
      price: formatMoney(booking.total.amountMinor),
      perPerson: t("perPerson", { price: formatMoney(booking.perPerson.amountMinor) }),
      prepayment: t("prepayment", { amount: formatMoney(booking.prepayment.amountMinor) }),
    };
  }

  return { toBookingCard };
}
