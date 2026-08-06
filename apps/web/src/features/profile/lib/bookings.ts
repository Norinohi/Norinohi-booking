import type { SampleBoat } from "@/lib/sample-boats";
import { SAMPLE_MARINAS } from "@/lib/sample-marinas";

/*
 * Placeholder "My Bookings" history — Figma "My bookings" (972:54737 desktop, 973:81652 tablet).
 * Three past charters rendered as booking cards until the bookings API lands. Below xl the
 * booking card reuses the full search Boat Card, so each entry carries the complete value set
 * a SampleBoat does (specs, amenities, stats, price breakdown); the tablet mock shows the shared
 * card's default content on every instance, so per-boat values mirror the search catalogue.
 */

export type Booking = Omit<SampleBoat, "badges">;

const PHOTO = "/assets/yachts/lagoon-42.jpg";
const photos = (count: number) => Array.from({ length: count }, () => PHOTO);

export const SAMPLE_BOOKINGS: Booking[] = [
  {
    id: "lagoon-42",
    images: photos(5),
    marina: SAMPLE_MARINAS.aciDubrovnik,
    name: "Lagoon 42",
    rating: "5.9",
    charterType: "bareboat",
    crew: "fullCrew",
    spec: { year: 2016, people: 12, toilets: 2, baths: 2, cabins: 4, length: "12.8 m" },
    amenities: ["wifi", "solar", "paddle"],
    stats: { booked: 3, viewed: 42 },
    start: "2026-07-07T17:00:00Z",
    end: "2026-07-25T22:00:00Z",
    timeZone: "UTC",
    days: 7,
    price: 5700,
    perPerson: 600,
    perPersonApprox: true,
    prepayment: 1400,
  },
  {
    id: "sunreef-60",
    images: photos(6),
    marina: SAMPLE_MARINAS.portisco,
    name: "Sunreef",
    rating: "5.9",
    charterType: "bareboat",
    crew: "fullCrew",
    spec: {
      year: 2021,
      people: 10,
      toilets: 5,
      baths: 5,
      cabins: 5,
      length: "18.3 m",
      mainsail: "Full batten mainsail",
    },
    amenities: ["wifi", "air", "waterToys"],
    stats: { booked: 1, viewed: 88 },
    start: "2026-07-07T17:00:00Z",
    end: "2026-07-25T22:00:00Z",
    timeZone: "UTC",
    days: 7,
    price: 12700,
    perPerson: 1270,
    perPersonApprox: true,
    prepayment: 3100,
  },
  {
    id: "bavaria-c38",
    images: photos(4),
    marina: SAMPLE_MARINAS.mykonos,
    name: "Bavaria C38",
    rating: "5.9",
    charterType: "bareboat",
    crew: "fullCrew",
    spec: { year: 2022, people: 8, toilets: 2, baths: 1, cabins: 3, length: "11.7 m" },
    amenities: ["wifi", "solar", "galley"],
    stats: { booked: 2, viewed: 29 },
    start: "2026-07-07T17:00:00Z",
    end: "2026-07-25T22:00:00Z",
    timeZone: "UTC",
    days: 7,
    price: 4700,
    perPerson: 590,
    perPersonApprox: true,
    prepayment: 1150,
  },
];
