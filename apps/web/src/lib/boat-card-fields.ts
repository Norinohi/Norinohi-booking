import {
  Anchor,
  Check,
  Compass,
  Droplets,
  Flame,
  ShowerHead,
  Snowflake,
  Sun,
  Toilet,
  Waves,
  Wifi,
  Zap,
} from "lucide-react";
import type { useTranslations } from "next-intl";
import { createElement, type ReactNode } from "react";

import type {
  BoatCardAmenity,
  BoatCardProps,
  BoatCardSpec,
} from "@/components/shared/data-display/boat-card";
import type { Marina } from "@/components/shared/overlay/marina-popover";
import { slugToLabel } from "@/lib/slug-to-label";

/*
 * Mapping helpers for the shared BoatCard. Both card sources — the search catalogue
 * (useListingCards) and My Bookings (useBookingCards) — describe the same boat, so the fields that
 * come purely from a listing snapshot are assembled here once. Each source keeps only its own
 * context: the price, the schedule and the marina, which mean different things and come from
 * different shapes in each. The BoatCard prop types are referenced type-only, so this stays a leaf
 * utility with no runtime dependency on the component layer.
 */

// Keyed by the amenity label the provider sent, so the key domain is open.
const AMENITY_ICONS = new Map<string, ReactNode>([
  ["Air conditioning", createElement(Snowflake)],
  ["Wi-Fi", createElement(Wifi)],
  ["Generator", createElement(Zap)],
  ["Solar panels", createElement(Sun)],
  ["Watermaker", createElement(Droplets)],
  ["Autopilot", createElement(Compass)],
  ["Cockpit grill", createElement(Flame)],
  ["Snorkeling set", createElement(Waves)],
  ["Stand-up paddleboard", createElement(Waves)],
  ["Dinghy", createElement(Anchor)],
]);
const FALLBACK_AMENITY_ICON = createElement(Check);
const AMENITY_LIMIT = 3;

/** The card shows the first three amenities, each with its glyph (or a generic check). */
export function amenityItems(labels: string[]): BoatCardAmenity[] {
  return labels.slice(0, AMENITY_LIMIT).map((label) => ({
    icon: AMENITY_ICONS.get(label) ?? FALLBACK_AMENITY_ICON,
    label,
  }));
}

export type BoatSpecs = {
  lengthM: number;
  cabins: number;
  berths: number;
  heads: number;
  yearBuilt: number;
  sailType: string | null;
};

type BoatCardTranslator = ReturnType<typeof useTranslations<"Common.boatCard">>;

export function boatSpecs(t: BoatCardTranslator, specs: BoatSpecs): BoatCardSpec[] {
  return [
    { label: t("specs.year"), value: String(specs.yearBuilt) },
    { label: t("specs.people"), value: String(specs.berths) },
    /*
     * The sanitary pair is drawn as glyphs rather than spelled out. Both counts are `heads`: a
     * head on a charter yacht is a compartment with a WC and a shower, and neither provider
     * mapping projects showers separately yet (NauSYS does send a `showers` field).
     */
    { label: t("specs.toilets"), value: String(specs.heads), icon: createElement(Toilet) },
    { label: t("specs.showers"), value: String(specs.heads), icon: createElement(ShowerHead) },
    {
      label: t("specs.mainsail"),
      value: specs.sailType ? slugToLabel(specs.sailType) : t("battenMainsail"),
    },
    { label: t("specs.cabins"), value: String(specs.cabins) },
    { label: t("specs.length"), value: `${specs.lengthM} m` },
  ];
}

/**
 * The intersection both card sources satisfy: a boat's listing snapshot. `booking.list.listing`
 * mirrors the search listing's card fields, so the same identity mapping serves both.
 */
export type BoatCardListing = {
  id: string;
  title: string;
  gallery: string[];
  mainImage: string | null;
  rating: number;
  category: string | null;
  crewType: string | null;
  specs: BoatSpecs;
  amenities: string[];
  /* Absent on a My Bookings card: the counts describe a boat someone is still choosing. */
  bookingStats?: { bookedThisMonth: number; viewedToday: number };
  badges: { label: string }[];
};

type PricedListing = {
  priceFrom: { amountMinor: number } | null;
  availability: { hasAvailableDates: boolean };
};

/**
 * What a card shows where the amount goes. A listing with no bookable slot reads as
 * unavailable; one with dates but no price is quotable, so it reads as on request.
 * Callers pair this with `priceIsLabel` so the slot drops to text size for both.
 */
export function boatCardPrice(
  t: BoatCardTranslator,
  listing: PricedListing,
  formatMoney: (amountMinor: number) => string,
) {
  if (listing.priceFrom) return formatMoney(listing.priceFrom.amountMinor);
  return listing.availability.hasAvailableDates ? t("priceOnRequest") : t("priceUnavailable");
}

/**
 * The "N booked / N viewed" lines, which are real counts and therefore often zero.
 * A zero line is dropped rather than rendered: "0 people viewed today" is true but
 * reads as a warning, and the card has nothing to say when nobody has looked yet.
 */
function boatCardStats(t: BoatCardTranslator, stats: BoatCardListing["bookingStats"]) {
  if (!stats) return undefined;

  const lines: string[] = [];
  if (stats.bookedThisMonth > 0) lines.push(t("stats.booked", { count: stats.bookedThisMonth }));
  if (stats.viewedToday > 0) lines.push(t("stats.viewed", { count: stats.viewedToday }));
  return lines.length > 0 ? lines : undefined;
}

/** The BoatCard fields that depend only on the boat — shared by the catalogue and My Bookings. */
export function boatCardIdentity(t: BoatCardTranslator, listing: BoatCardListing) {
  return {
    id: listing.id,
    images: listing.gallery.length ? listing.gallery : listing.mainImage ? [listing.mainImage] : [],
    badges: listing.badges.map((badge) => ({ label: badge.label })),
    name: listing.title,
    // A listing nobody has scored is not a listing scored zero, and a gold "0" reads as the
    // worst rating on the site. The read model coalesces an absent score to 0, so this is the
    // only place that distinction can be put back.
    rating: listing.rating > 0 ? String(listing.rating) : undefined,
    charterType: listing.category ?? "",
    crew: listing.crewType ? slugToLabel(listing.crewType) : "",
    specs: boatSpecs(t, listing.specs),
    amenities: amenityItems(listing.amenities),
    stats: boatCardStats(t, listing.bookingStats),
  } satisfies Partial<BoatCardProps>;
}

/**
 * The base a booking was made at, as the shared Marina shape.
 *
 * A booking's frozen base snapshot names its fields differently from a listing's
 * (address/locationName/countryName/coordinates vs region/location/country/lat/lng), so this
 * stays separate from the catalogue's own mapping. There is no base id, so the caller passes
 * something stable to stand in.
 */
export function bookingMarina(
  id: string,
  base: {
    name: string;
    address: string;
    locationName: string;
    countryName: string;
    phone: string | null;
    website: string | null;
    email: string | null;
    coordinates: { lat: number; lng: number };
  },
): Marina {
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
