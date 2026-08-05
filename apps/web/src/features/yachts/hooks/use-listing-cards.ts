"use client";

import type { AppRouterClient } from "@yacht-charter/api/routers/index";
import {
  Anchor,
  Check,
  Compass,
  Droplets,
  Flame,
  Snowflake,
  Sun,
  Waves,
  Wifi,
  Zap,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { createElement, type ReactNode } from "react";

import type { BoatCardProps } from "@/components/shared/data-display/boat-card";
import type { Marina } from "@/components/shared/overlay/marina-popover";

import type { MapBoatCardProps } from "../components/map/map-boat-card";

type ResultsOutput = Awaited<ReturnType<AppRouterClient["charterSearch"]["results"]>>;
type ResultItem = ResultsOutput["items"][number];
type Listing = ResultItem["listing"];

const AMENITY_ICON: Record<string, ReactNode> = {
  "Air conditioning": createElement(Snowflake),
  "Wi-Fi": createElement(Wifi),
  Generator: createElement(Zap),
  "Solar panels": createElement(Sun),
  Watermaker: createElement(Droplets),
  Autopilot: createElement(Compass),
  "Cockpit grill": createElement(Flame),
  "Snorkeling set": createElement(Waves),
  "Stand-up paddleboard": createElement(Waves),
  Dinghy: createElement(Anchor),
};
const FALLBACK_AMENITY_ICON = createElement(Check);
const AMENITY_LIMIT = 3;

// TODO: hardcoded until results return UTC ISO check-in/out + base.timeZone.
const PLACEHOLDER_DATES = {
  start: "2026-07-07T15:00:00Z",
  end: "2026-07-14T07:00:00Z",
  timeZone: "Europe/Zagreb",
};

const prettify = (slug: string) => slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

function toMarina(base: Listing["base"]): Marina {
  return {
    id: base.id,
    name: base.name,
    address: base.region,
    city: base.location,
    country: base.country,
    phone: base.phone ?? undefined,
    website: base.website ?? undefined,
    email: base.email ?? undefined,
    coordinates: { lat: base.lat, lng: base.lng },
  };
}

export function useListingCards() {
  const t = useTranslations("Common.boatCard");
  const format = useFormatter();

  const eur = (minor: number) => format.number(minor / 100, "eur");

  function toCard(listing: Listing): BoatCardProps & { id: string } {
    return {
      id: listing.id,
      images: listing.gallery.length ? listing.gallery : [listing.mainImage],
      imageAlt: t("imageAlt", { name: listing.title, marina: listing.base.name }),
      badges: listing.badges.map((badge) => ({ label: badge.label })),
      marina: toMarina(listing.base),
      name: listing.title,
      rating: String(listing.rating),
      charterType: listing.category,
      crew: listing.crewType ? prettify(listing.crewType) : "",
      specs: [
        { label: t("specs.year"), value: String(listing.specs.yearBuilt) },
        { label: t("specs.people"), value: String(listing.specs.berths) },
        { label: t("specs.toilets"), value: String(listing.specs.heads) },
        { label: t("specs.baths"), value: String(listing.specs.heads) },
        {
          label: t("specs.mainsail"),
          value: listing.specs.sailType ? prettify(listing.specs.sailType) : t("battenMainsail"),
        },
        { label: t("specs.cabins"), value: String(listing.specs.cabins) },
        { label: t("specs.length"), value: `${listing.specs.lengthM} m` },
      ],
      amenities: listing.amenities.slice(0, AMENITY_LIMIT).map((amenity) => ({
        icon: AMENITY_ICON[amenity] ?? FALLBACK_AMENITY_ICON,
        label: amenity,
      })),
      stats: [
        t("stats.booked", { count: listing.bookingStats.bookedThisMonth }),
        t("stats.viewed", { count: listing.bookingStats.viewedToday }),
      ],
      start: PLACEHOLDER_DATES.start,
      end: PLACEHOLDER_DATES.end,
      timeZone: PLACEHOLDER_DATES.timeZone,
      priceLabel: t("priceFor", { days: listing.priceDetails.periodDays }),
      price: eur(listing.priceFrom.amountMinor),
      perPerson:
        listing.priceDetails.perPersonMinor != null
          ? t("perPerson", { price: eur(listing.priceDetails.perPersonMinor) })
          : "",
      prepayment: t("prepayment", {
        amount: eur(listing.priceDetails.bookingPrepayment.amountMinor),
      }),
    };
  }

  function toMapCard(listing: Listing): MapBoatCardProps & { id: string } {
    const card = toCard(listing);
    return {
      id: card.id,
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
