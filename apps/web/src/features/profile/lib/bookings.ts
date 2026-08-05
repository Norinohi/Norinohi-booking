import type { Marina } from "@/components/shared/overlay/marina-popover";
import { SAMPLE_MARINAS } from "@/lib/sample-marinas";

/*
 * Placeholder "My Bookings" history — Figma "My bookings" (972:54737 desktop). Three past
 * charters rendered as booking cards until the bookings API lands. Reuses the sample marinas
 * where they match the design and defines the one bespoke marina (Portisco) the design shows.
 */

const PHOTO = "/assets/yachts/lagoon-42.jpg";
const photos = (count: number) => Array.from({ length: count }, () => PHOTO);

const portisco: Marina = {
  id: "marina-di-portisco",
  name: "Marina di Portisco",
  address: "Località Portisco",
  city: "Sardinia",
  country: "Italy",
  phone: "+39 0789 33520",
  website: "www.marinadiportisco.com",
  coordinates: { lat: 41.02, lng: 9.53 },
  mapImageUrl: "/assets/marinas/map-thumb.jpg",
};

export type Booking = {
  id: string;
  images: string[];
  imageAlt: string;
  marina: Marina;
  name: string;
  rating: string;
  charterType: "bareboat";
  crew: "fullCrew";
  /** ISO local start / end of the charter. */
  start: string;
  end: string;
  timeZone: string;
  price: string;
};

export const SAMPLE_BOOKINGS: Booking[] = [
  {
    id: "lagoon-42",
    images: photos(5),
    imageAlt: "Lagoon 42 moored at ACI Marina Dubrovnik",
    marina: SAMPLE_MARINAS.aciDubrovnik,
    name: "Lagoon 42",
    rating: "5.9",
    charterType: "bareboat",
    crew: "fullCrew",
    start: "2026-07-07T17:00:00Z",
    end: "2026-07-25T22:00:00Z",
    timeZone: "UTC",
    price: "€5,700",
  },
  {
    id: "sunreef-60",
    images: photos(6),
    imageAlt: "Sunreef 60 at Marina di Portisco",
    marina: portisco,
    name: "Sunreef",
    rating: "5.9",
    charterType: "bareboat",
    crew: "fullCrew",
    start: "2026-07-07T17:00:00Z",
    end: "2026-07-25T22:00:00Z",
    timeZone: "UTC",
    price: "€12,700",
  },
  {
    id: "bavaria-c38",
    images: photos(4),
    imageAlt: "Bavaria C38 at Mykonos New Port Marina",
    marina: SAMPLE_MARINAS.mykonos,
    name: "Bavaria C38",
    rating: "5.9",
    charterType: "bareboat",
    crew: "fullCrew",
    start: "2026-07-07T17:00:00Z",
    end: "2026-07-25T22:00:00Z",
    timeZone: "UTC",
    price: "€4,700",
  },
];
