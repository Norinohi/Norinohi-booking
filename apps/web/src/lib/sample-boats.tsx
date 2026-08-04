import {
  Anchor,
  Refrigerator,
  Snowflake,
  Sun,
  Tag,
  Utensils,
  Waves,
  Wifi,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";

import { SAMPLE_MARINAS } from "@/lib/sample-marinas";

import type { Marina } from "@/components/shared/overlay/marina-popover";

/*
 * Placeholder catalogue. Values only — every user-facing string is built from the
 * `Common.boatCard` namespace by `useBoatCards`, so the data never carries a language.
 */
export type AmenityKey =
  | "wifi"
  | "solar"
  | "paddle"
  | "air"
  | "waterToys"
  | "galley"
  | "fridge"
  | "tender";

export type BadgeKey = "bestForFamilies" | "bestValue" | "new";
export type SampleBadge = BadgeKey | { discount: number };

export type CharterTypeKey = "bareboat" | "bareboatSailingYacht" | "catamaran";
export type CrewKey = "fullCrew" | "skipperOptional";

export type SampleSpec = {
  year: number;
  people: number;
  toilets: number;
  baths: number;
  cabins: number;
  length: string;
  mainsail?: string;
};

export type SampleBoat = {
  id: string;
  images: string[];
  badges?: SampleBadge[];
  marina: Marina;
  name: string;
  rating: string;
  charterType: CharterTypeKey;
  crew: CrewKey;
  spec: SampleSpec;
  amenities?: AmenityKey[];
  stats?: { booked: number; viewed: number };
  start: string;
  end: string;
  timeZone: string;
  days: number;
  price: number;
  perPerson: number;
  perPersonApprox?: boolean;
  prepayment: number;
};

export const AMENITY_ICONS: Record<AmenityKey, ReactNode> = {
  wifi: <Wifi />,
  solar: <Sun />,
  paddle: <Wrench />,
  air: <Snowflake />,
  waterToys: <Waves />,
  galley: <Utensils />,
  fridge: <Refrigerator />,
  tender: <Anchor />,
};

export const DISCOUNT_ICON: ReactNode = <Tag />;

const PHOTO = "/assets/yachts/lagoon-42.jpg";

const photos = (count: number) => Array.from({ length: count }, () => PHOTO);

export const SAMPLE_BOATS: SampleBoat[] = [
  {
    id: "lagoon-42",
    images: photos(5),
    badges: ["bestForFamilies", "bestValue", { discount: 15 }],
    marina: SAMPLE_MARINAS.aciSplit,
    name: "Lagoon 42",
    rating: "5.9",
    charterType: "bareboat",
    crew: "fullCrew",
    spec: { year: 2016, people: 12, toilets: 2, baths: 2, cabins: 4, length: "12.8 m" },
    amenities: ["wifi", "solar", "paddle"],
    stats: { booked: 3, viewed: 42 },
    start: "2026-07-07T17:00:00+02:00",
    end: "2026-07-25T22:00:00+02:00",
    timeZone: "Europe/Zagreb",
    days: 7,
    price: 5700,
    perPerson: 475,
    perPersonApprox: true,
    prepayment: 1400,
  },
  {
    id: "sunreef-60",
    images: photos(6),
    marina: SAMPLE_MARINAS.aciSplit,
    name: "Sunreef 60",
    rating: "5.9",
    charterType: "catamaran",
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
    start: "2026-07-07T17:00:00+02:00",
    end: "2026-07-25T22:00:00+02:00",
    timeZone: "Europe/Zagreb",
    days: 7,
    price: 18500,
    perPerson: 1850,
    prepayment: 4600,
  },
  {
    id: "beneteau-oceanis-46",
    images: photos(4),
    marina: SAMPLE_MARINAS.aciSplit,
    name: "Beneteau Oceanis 46.1",
    rating: "5.9",
    charterType: "bareboatSailingYacht",
    crew: "fullCrew",
    spec: { year: 2019, people: 10, toilets: 3, baths: 2, cabins: 4, length: "14.6 m" },
    amenities: ["wifi", "solar", "paddle"],
    stats: { booked: 5, viewed: 37 },
    start: "2026-07-07T17:00:00+02:00",
    end: "2026-07-25T22:00:00+02:00",
    timeZone: "Europe/Zagreb",
    days: 7,
    price: 4200,
    perPerson: 420,
    perPersonApprox: true,
    prepayment: 1050,
  },
  {
    id: "lagoon-52f",
    images: photos(5),
    badges: ["bestValue", { discount: 15 }],
    marina: SAMPLE_MARINAS.aciDubrovnik,
    name: "Lagoon 52 F",
    rating: "5.9",
    charterType: "bareboat",
    crew: "fullCrew",
    spec: { year: 2020, people: 12, toilets: 4, baths: 4, cabins: 6, length: "15.8 m" },
    amenities: ["wifi", "air", "tender"],
    stats: { booked: 4, viewed: 61 },
    start: "2026-07-07T17:00:00+02:00",
    end: "2026-07-25T22:00:00+02:00",
    timeZone: "Europe/Zagreb",
    days: 7,
    price: 15900,
    perPerson: 1325,
    perPersonApprox: true,
    prepayment: 3900,
  },
  {
    id: "bavaria-c38",
    images: photos(4),
    badges: ["bestForFamilies", { discount: 15 }],
    marina: SAMPLE_MARINAS.mykonos,
    name: "Bavaria C38",
    rating: "5.9",
    charterType: "bareboat",
    crew: "fullCrew",
    spec: { year: 2022, people: 8, toilets: 2, baths: 1, cabins: 3, length: "11.7 m" },
    amenities: ["wifi", "solar", "galley"],
    stats: { booked: 2, viewed: 29 },
    start: "2026-07-07T17:00:00+03:00",
    end: "2026-07-25T22:00:00+03:00",
    timeZone: "Europe/Athens",
    days: 7,
    price: 7800,
    perPerson: 975,
    perPersonApprox: true,
    prepayment: 1950,
  },
  {
    id: "dufour-470",
    images: photos(3),
    marina: SAMPLE_MARINAS.palma,
    name: "Dufour 470",
    rating: "5.9",
    charterType: "bareboat",
    crew: "fullCrew",
    spec: { year: 2021, people: 10, toilets: 3, baths: 2, cabins: 4, length: "14.2 m" },
    amenities: ["wifi", "air", "paddle"],
    stats: { booked: 3, viewed: 18 },
    start: "2026-07-07T17:00:00+02:00",
    end: "2026-07-25T22:00:00+02:00",
    timeZone: "Europe/Madrid",
    days: 7,
    price: 6900,
    perPerson: 690,
    perPersonApprox: true,
    prepayment: 1700,
  },
  {
    id: "fountaine-pajot-elba-45",
    images: photos(6),
    badges: ["bestForFamilies", "bestValue"],
    marina: SAMPLE_MARINAS.aoPo,
    name: "Fountaine Pajot Elba 45",
    rating: "5.9",
    charterType: "bareboat",
    crew: "fullCrew",
    spec: { year: 2019, people: 12, toilets: 4, baths: 4, cabins: 4, length: "13.6 m" },
    amenities: ["wifi", "air", "waterToys"],
    stats: { booked: 6, viewed: 54 },
    start: "2026-07-07T17:00:00+07:00",
    end: "2026-07-25T22:00:00+07:00",
    timeZone: "Asia/Bangkok",
    days: 7,
    price: 5700,
    perPerson: 475,
    perPersonApprox: true,
    prepayment: 1400,
  },
  {
    id: "sun-odyssey-410",
    images: photos(4),
    marina: SAMPLE_MARINAS.kastela,
    name: "Sun Odyssey 410",
    rating: "5.7",
    charterType: "bareboat",
    crew: "skipperOptional",
    spec: { year: 2018, people: 8, toilets: 2, baths: 1, cabins: 3, length: "12.3 m" },
    amenities: ["wifi", "solar", "galley"],
    stats: { booked: 2, viewed: 23 },
    start: "2026-07-07T17:00:00+02:00",
    end: "2026-07-25T22:00:00+02:00",
    timeZone: "Europe/Zagreb",
    days: 7,
    price: 3900,
    perPerson: 490,
    perPersonApprox: true,
    prepayment: 980,
  },
  {
    id: "hanse-508",
    images: photos(5),
    badges: [{ discount: 20 }],
    marina: SAMPLE_MARINAS.gocek,
    name: "Hanse 508",
    rating: "5.8",
    charterType: "bareboatSailingYacht",
    crew: "fullCrew",
    spec: {
      year: 2020,
      people: 10,
      toilets: 3,
      baths: 3,
      cabins: 5,
      length: "15.4 m",
      mainsail: "Full batten mainsail",
    },
    amenities: ["wifi", "air", "tender"],
    stats: { booked: 4, viewed: 46 },
    start: "2026-07-07T17:00:00+03:00",
    end: "2026-07-25T22:00:00+03:00",
    timeZone: "Europe/Istanbul",
    days: 7,
    price: 8400,
    perPerson: 840,
    perPersonApprox: true,
    prepayment: 2100,
  },
  {
    id: "bali-46",
    images: photos(5),
    badges: ["bestForFamilies"],
    marina: SAMPLE_MARINAS.alimos,
    name: "Bali 4.6",
    rating: "5.9",
    charterType: "catamaran",
    crew: "fullCrew",
    spec: { year: 2022, people: 12, toilets: 4, baths: 4, cabins: 5, length: "14.0 m" },
    amenities: ["wifi", "air", "waterToys"],
    stats: { booked: 7, viewed: 73 },
    start: "2026-07-07T17:00:00+03:00",
    end: "2026-07-25T22:00:00+03:00",
    timeZone: "Europe/Athens",
    days: 7,
    price: 11200,
    perPerson: 930,
    perPersonApprox: true,
    prepayment: 2800,
  },
  {
    id: "lagoon-46",
    images: photos(6),
    badges: ["bestValue"],
    marina: SAMPLE_MARINAS.nannyCay,
    name: "Lagoon 46",
    rating: "5.9",
    charterType: "bareboat",
    crew: "fullCrew",
    spec: { year: 2021, people: 12, toilets: 4, baths: 4, cabins: 4, length: "13.9 m" },
    amenities: ["wifi", "air", "paddle"],
    stats: { booked: 5, viewed: 64 },
    start: "2026-07-07T17:00:00-04:00",
    end: "2026-07-25T22:00:00-04:00",
    timeZone: "America/Tortola",
    days: 7,
    price: 13600,
    perPerson: 1130,
    perPersonApprox: true,
    prepayment: 3400,
  },
  {
    id: "oceanis-51",
    images: photos(4),
    marina: SAMPLE_MARINAS.portisco,
    name: "Beneteau Oceanis 51.1",
    rating: "5.8",
    charterType: "bareboatSailingYacht",
    crew: "skipperOptional",
    spec: { year: 2020, people: 10, toilets: 3, baths: 3, cabins: 5, length: "15.9 m" },
    amenities: ["wifi", "fridge", "galley"],
    stats: { booked: 3, viewed: 31 },
    start: "2026-07-07T17:00:00+02:00",
    end: "2026-07-25T22:00:00+02:00",
    timeZone: "Europe/Rome",
    days: 7,
    price: 9300,
    perPerson: 930,
    perPersonApprox: true,
    prepayment: 2300,
  },
  {
    id: "elan-impression-45",
    images: photos(3),
    badges: ["bestValue", { discount: 15 }],
    marina: SAMPLE_MARINAS.punat,
    name: "Elan Impression 45.1",
    rating: "5.6",
    charterType: "bareboat",
    crew: "skipperOptional",
    spec: { year: 2017, people: 10, toilets: 3, baths: 2, cabins: 4, length: "13.9 m" },
    amenities: ["wifi", "solar", "galley"],
    stats: { booked: 2, viewed: 26 },
    start: "2026-07-07T17:00:00+02:00",
    end: "2026-07-25T22:00:00+02:00",
    timeZone: "Europe/Zagreb",
    days: 7,
    price: 4600,
    perPerson: 460,
    perPersonApprox: true,
    prepayment: 1150,
  },
  {
    id: "astrea-42",
    images: photos(5),
    marina: SAMPLE_MARINAS.leMarin,
    name: "Fountaine Pajot Astréa 42",
    rating: "5.8",
    charterType: "catamaran",
    crew: "fullCrew",
    spec: { year: 2019, people: 10, toilets: 4, baths: 4, cabins: 4, length: "12.6 m" },
    amenities: ["wifi", "air", "tender"],
    stats: { booked: 4, viewed: 39 },
    start: "2026-07-07T17:00:00-04:00",
    end: "2026-07-25T22:00:00-04:00",
    timeZone: "America/Martinique",
    days: 7,
    price: 10800,
    perPerson: 1080,
    perPersonApprox: true,
    prepayment: 2700,
  },
  {
    id: "dufour-530",
    images: photos(4),
    badges: ["new"],
    marina: SAMPLE_MARINAS.antibes,
    name: "Dufour 530",
    rating: "5.9",
    charterType: "bareboatSailingYacht",
    crew: "fullCrew",
    spec: {
      year: 2023,
      people: 10,
      toilets: 3,
      baths: 3,
      cabins: 5,
      length: "16.2 m",
      mainsail: "Full batten mainsail",
    },
    amenities: ["wifi", "air", "waterToys"],
    stats: { booked: 1, viewed: 57 },
    start: "2026-07-07T17:00:00+02:00",
    end: "2026-07-25T22:00:00+02:00",
    timeZone: "Europe/Paris",
    days: 7,
    price: 12500,
    perPerson: 1250,
    perPersonApprox: true,
    prepayment: 3100,
  },
  {
    id: "sun-odyssey-490",
    images: photos(4),
    marina: SAMPLE_MARINAS.zeas,
    name: "Sun Odyssey 490",
    rating: "5.7",
    charterType: "bareboat",
    crew: "skipperOptional",
    spec: { year: 2018, people: 10, toilets: 3, baths: 2, cabins: 5, length: "14.7 m" },
    amenities: ["wifi", "solar", "paddle"],
    stats: { booked: 3, viewed: 22 },
    start: "2026-07-07T17:00:00+03:00",
    end: "2026-07-25T22:00:00+03:00",
    timeZone: "Europe/Athens",
    days: 7,
    price: 6100,
    perPerson: 610,
    perPersonApprox: true,
    prepayment: 1500,
  },
  {
    id: "nautitech-46",
    images: photos(5),
    badges: ["bestForFamilies", "bestValue"],
    marina: SAMPLE_MARINAS.frapa,
    name: "Nautitech 46 Open",
    rating: "5.8",
    charterType: "catamaran",
    crew: "fullCrew",
    spec: { year: 2020, people: 12, toilets: 4, baths: 4, cabins: 4, length: "13.8 m" },
    amenities: ["wifi", "air", "fridge"],
    stats: { booked: 5, viewed: 48 },
    start: "2026-07-07T17:00:00+02:00",
    end: "2026-07-25T22:00:00+02:00",
    timeZone: "Europe/Zagreb",
    days: 7,
    price: 9900,
    perPerson: 825,
    perPersonApprox: true,
    prepayment: 2400,
  },
  {
    id: "oceanis-yacht-62",
    images: photos(6),
    badges: [{ discount: 20 }],
    marina: SAMPLE_MARINAS.ibiza,
    name: "Oceanis Yacht 62",
    rating: "5.9",
    charterType: "bareboatSailingYacht",
    crew: "fullCrew",
    spec: {
      year: 2022,
      people: 8,
      toilets: 4,
      baths: 4,
      cabins: 4,
      length: "18.9 m",
      mainsail: "Full batten mainsail",
    },
    amenities: ["wifi", "air", "tender"],
    stats: { booked: 2, viewed: 95 },
    start: "2026-07-07T17:00:00+02:00",
    end: "2026-07-25T22:00:00+02:00",
    timeZone: "Europe/Madrid",
    days: 7,
    price: 21400,
    perPerson: 2675,
    perPersonApprox: true,
    prepayment: 5300,
  },
];

export const RESULTS_TOTAL = 320;
export const RESULTS_PER_PAGE = 10;

export function getBoatsPage(page: number): SampleBoat[] {
  const offset = (page - 1) * RESULTS_PER_PAGE;
  const size = Math.min(page * RESULTS_PER_PAGE, RESULTS_TOTAL) - offset;
  return Array.from({ length: Math.max(size, 0) }, (_, index) => {
    const boat = SAMPLE_BOATS[(offset + index) % SAMPLE_BOATS.length] as SampleBoat;
    return { ...boat, id: `${boat.id}-p${page}` };
  });
}
