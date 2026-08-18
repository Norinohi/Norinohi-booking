import { sql } from "drizzle-orm";

import { db } from "./index";
import { rebuildListingSearchDocs } from "./search";
import {
  amenity,
  amenityCategory,
  loyaltyPerk,
  loyaltyTier,
  availabilitySlot,
  base,
  builder,
  listingFreePeriod,
  listingPricePeriod,
  country,
  facetMedia,
  facetMediaTranslation,
  faq,
  listing,
  listingAmenity,
  listingCheckinRule,
  listingMedia,
  listingSource,
  listingSpecification,
  location,
  operator,
  provider,
  providerExtraCatalogue,
  providerRecord,
  providerRawPayload,
  region,
  review,
  syncRun,
  yachtCategory,
  yachtModel,
} from "./schema";

const providerId = "prv_mock";

const countries = [
  { id: "cty_hr", code: "HR", name: "Croatia" },
  { id: "cty_gr", code: "GR", name: "Greece" },
  { id: "cty_it", code: "IT", name: "Italy" },
  { id: "cty_es", code: "ES", name: "Spain" },
  { id: "cty_th", code: "TH", name: "Thailand" },
];

const regions = [
  { id: "rgn_dalmatia", countryId: "cty_hr", name: "Dalmatia" },
  { id: "rgn_attica", countryId: "cty_gr", name: "Attica" },
  { id: "rgn_cyclades", countryId: "cty_gr", name: "Cyclades" },
  { id: "rgn_ionian", countryId: "cty_gr", name: "Ionian Islands" },
  { id: "rgn_campania", countryId: "cty_it", name: "Campania" },
  { id: "rgn_balearics", countryId: "cty_es", name: "Balearic Islands" },
  { id: "rgn_phuket", countryId: "cty_th", name: "Phuket" },
];

/*
 * `city` repeats `name` here because these fixtures name their locations after towns. A vendor
 * does not: NauSYS files the marina under `location`, which is why the column exists at all
 * (see `location.city`). Filling it keeps the city-level catalogue pages reachable locally.
 */
const locations = [
  { id: "loc_split", regionId: "rgn_dalmatia", name: "Split", city: "Split" },
  { id: "loc_dubrovnik", regionId: "rgn_dalmatia", name: "Dubrovnik", city: "Dubrovnik" },
  { id: "loc_sibenik", regionId: "rgn_dalmatia", name: "Sibenik", city: "Sibenik" },
  { id: "loc_athens", regionId: "rgn_attica", name: "Athens", city: "Athens" },
  { id: "loc_mykonos", regionId: "rgn_cyclades", name: "Mykonos", city: "Mykonos" },
  { id: "loc_lefkada", regionId: "rgn_ionian", name: "Lefkada", city: "Lefkada" },
  { id: "loc_amalfi", regionId: "rgn_campania", name: "Amalfi Coast", city: "Amalfi" },
  {
    id: "loc_palma",
    regionId: "rgn_balearics",
    name: "Palma de Mallorca",
    city: "Palma de Mallorca",
  },
  { id: "loc_ibiza", regionId: "rgn_balearics", name: "Ibiza", city: "Ibiza" },
  { id: "loc_phuket", regionId: "rgn_phuket", name: "Ao Po", city: "Ao Po" },
];

const operators = [
  {
    id: "op_adriatic",
    externalCompanyId: "cmp-adriatic",
    name: "Adriatic Charter Co.",
    slug: "adriatic-charter-co",
    country: "Croatia",
    city: "Split",
    email: "ops@adriatic.example",
    phone: "+385 21 000 111",
  },
  {
    id: "op_aegean",
    externalCompanyId: "cmp-aegean",
    name: "Aegean Blue Yachting",
    slug: "aegean-blue-yachting",
    country: "Greece",
    city: "Athens",
    email: "charters@aegean.example",
    phone: "+30 210 000 222",
  },
  {
    id: "op_med_premium",
    externalCompanyId: "cmp-med",
    name: "Mediterranean Premium Fleet",
    slug: "mediterranean-premium-fleet",
    country: "Italy",
    city: "Salerno",
    email: "hello@medpremium.example",
    phone: "+39 06 000 333",
  },
  {
    id: "op_island_route",
    externalCompanyId: "cmp-island",
    name: "Island Route Charters",
    slug: "island-route-charters",
    country: "Spain",
    city: "Palma",
    email: "routes@island.example",
    phone: "+34 971 000 444",
  },
];

const bases = [
  {
    id: "base_split",
    externalId: "base-split",
    locationId: "loc_split",
    operatorId: "op_adriatic",
    name: "ACI Marina Split",
    lat: 43.503,
    lng: 16.43,
    email: "split@aci-marinas.com",
    phone: "+385 21 398 599",
    website: "www.aci-marinas.com",
    checkInTime: "17:00",
    checkOutTime: "09:00",
  },
  {
    id: "base_dubrovnik",
    externalId: "base-dubrovnik",
    locationId: "loc_dubrovnik",
    operatorId: "op_adriatic",
    name: "ACI Marina Dubrovnik",
    lat: 42.671,
    lng: 18.125,
    email: "dubrovnik@aci-marinas.com",
    phone: "+385 20 455 020",
    website: "www.aci-marinas.com",
    checkInTime: "17:00",
    checkOutTime: "09:00",
  },
  {
    id: "base_athens",
    externalId: "base-athens",
    locationId: "loc_athens",
    operatorId: "op_aegean",
    name: "Alimos Marina",
    lat: 37.914,
    lng: 23.704,
    email: "info@alimosmarina.gr",
    phone: "+30 210 988 8000",
    website: "www.alimosmarina.gr",
    checkInTime: "17:00",
    checkOutTime: "09:00",
  },
  {
    id: "base_mykonos",
    externalId: "base-mykonos",
    locationId: "loc_mykonos",
    operatorId: "op_aegean",
    name: "Mykonos New Port",
    lat: 37.464,
    lng: 25.326,
    email: "info@mykonos-port.gr",
    phone: "+30 22890 28888",
    website: "www.mykonos-port.gr",
    checkInTime: "16:00",
    checkOutTime: "09:00",
  },
  {
    id: "base_amalfi",
    externalId: "base-amalfi",
    locationId: "loc_amalfi",
    operatorId: "op_med_premium",
    name: "Marina d'Arechi",
    lat: 40.644,
    lng: 14.823,
    email: "info@marinadarechi.com",
    phone: "+39 089 251 5711",
    website: "www.marinadarechi.com",
    checkInTime: "17:00",
    checkOutTime: "10:00",
  },
  {
    id: "base_palma",
    externalId: "base-palma",
    locationId: "loc_palma",
    operatorId: "op_island_route",
    name: "La Lonja Marina",
    lat: 39.568,
    lng: 2.642,
    email: "info@lalonjamarina.com",
    phone: "+34 971 725 250",
    website: "www.lalonjamarina.com",
    checkInTime: "17:00",
    checkOutTime: "09:00",
  },
  {
    id: "base_sibenik",
    externalId: "base-sibenik",
    locationId: "loc_sibenik",
    operatorId: "op_adriatic",
    name: "D-Marin Mandalina",
    lat: 43.723,
    lng: 15.898,
    email: "mandalina@d-marin.com",
    phone: "+385 22 312 111",
    website: "www.d-marin.com",
    checkInTime: "17:00",
    checkOutTime: "09:00",
  },
  {
    id: "base_lefkada",
    externalId: "base-lefkada",
    locationId: "loc_lefkada",
    operatorId: "op_aegean",
    name: "Lefkas Marina",
    lat: 38.833,
    lng: 20.712,
    email: "info@lefkasmarina.gr",
    phone: "+30 26450 26645",
    website: "www.lefkasmarina.com",
    checkInTime: "17:00",
    checkOutTime: "09:00",
  },
  {
    id: "base_ibiza",
    externalId: "base-ibiza",
    locationId: "loc_ibiza",
    operatorId: "op_island_route",
    name: "Marina Botafoch",
    lat: 38.913,
    lng: 1.446,
    email: "info@marinabotafoch.com",
    phone: "+34 971 311 111",
    website: "www.marinabotafoch.com",
    checkInTime: "17:00",
    checkOutTime: "09:00",
  },
  {
    id: "base_phuket",
    externalId: "base-phuket",
    locationId: "loc_phuket",
    operatorId: "op_island_route",
    name: "Ao Po Grand Marina",
    lat: 8.067,
    lng: 98.445,
    email: "info@aopograndmarina.com",
    phone: "+66 76 348 470",
    website: "www.aopograndmarina.com",
    checkInTime: "15:00",
    checkOutTime: "10:00",
  },
];

const builders = [
  { id: "bld_lagoon", name: "Lagoon", slug: "lagoon" },
  { id: "bld_bavaria", name: "Bavaria", slug: "bavaria" },
  { id: "bld_sunreef", name: "Sunreef", slug: "sunreef" },
  { id: "bld_beneteau", name: "Beneteau", slug: "beneteau" },
  { id: "bld_dufour", name: "Dufour", slug: "dufour" },
  { id: "bld_fountaine_pajot", name: "Fountaine Pajot", slug: "fountaine-pajot" },
  { id: "bld_jeanneau", name: "Jeanneau", slug: "jeanneau" },
  { id: "bld_prestige", name: "Prestige", slug: "prestige" },
  { id: "bld_hanse", name: "Hanse", slug: "hanse" },
  { id: "bld_elan", name: "Elan", slug: "elan" },
  { id: "bld_bali", name: "Bali", slug: "bali" },
  { id: "bld_leopard", name: "Leopard", slug: "leopard" },
  { id: "bld_nautitech", name: "Nautitech", slug: "nautitech" },
  { id: "bld_azimut", name: "Azimut", slug: "azimut" },
  { id: "bld_sunseeker", name: "Sunseeker", slug: "sunseeker" },
  { id: "bld_ferretti", name: "Ferretti", slug: "ferretti" },
];

/**
 * Model catalogue. Every generated yacht is an instance of one of these, so the
 * per-model figures below are the baseline that the fleet generator varies from.
 * `weeklyBaseMinor` is a low-season weekly price in EUR minor units.
 */
const modelCatalog = [
  // Catamarans
  {
    id: "mdl_lagoon_42",
    builderId: "bld_lagoon",
    name: "Lagoon 42",
    displayName: "Lagoon 42",
    categoryId: "cat_catamaran",
    lengthM: 12.8,
    cabins: 4,
    berths: 10,
    heads: 4,
    weeklyBaseMinor: 540_000,
  },
  {
    id: "mdl_lagoon_46",
    builderId: "bld_lagoon",
    name: "Lagoon 46",
    displayName: "Lagoon 46",
    categoryId: "cat_catamaran",
    lengthM: 13.99,
    cabins: 4,
    berths: 12,
    heads: 4,
    weeklyBaseMinor: 690_000,
  },
  {
    id: "mdl_lagoon_52f",
    builderId: "bld_lagoon",
    name: "Lagoon 52 F",
    displayName: "Lagoon 52 F",
    categoryId: "cat_catamaran",
    lengthM: 15.84,
    cabins: 6,
    berths: 12,
    heads: 4,
    weeklyBaseMinor: 1_660_000,
  },
  {
    id: "mdl_elba_45",
    builderId: "bld_fountaine_pajot",
    name: "Elba 45",
    displayName: "Fountaine Pajot Elba 45",
    categoryId: "cat_catamaran",
    lengthM: 13.45,
    cabins: 4,
    berths: 12,
    heads: 4,
    weeklyBaseMinor: 570_000,
  },
  {
    id: "mdl_astrea_42",
    builderId: "bld_fountaine_pajot",
    name: "Astrea 42",
    displayName: "Fountaine Pajot Astrea 42",
    categoryId: "cat_catamaran",
    lengthM: 12.58,
    cabins: 4,
    berths: 10,
    heads: 4,
    weeklyBaseMinor: 520_000,
  },
  {
    id: "mdl_bali_4_4",
    builderId: "bld_bali",
    name: "Bali 4.4",
    displayName: "Bali 4.4",
    categoryId: "cat_catamaran",
    lengthM: 13.6,
    cabins: 4,
    berths: 10,
    heads: 4,
    weeklyBaseMinor: 610_000,
  },
  {
    id: "mdl_bali_5_4",
    builderId: "bld_bali",
    name: "Bali 5.4",
    displayName: "Bali 5.4",
    categoryId: "cat_catamaran",
    lengthM: 16.2,
    cabins: 6,
    berths: 12,
    heads: 6,
    weeklyBaseMinor: 1_180_000,
  },
  {
    id: "mdl_leopard_45",
    builderId: "bld_leopard",
    name: "Leopard 45",
    displayName: "Leopard 45",
    categoryId: "cat_catamaran",
    lengthM: 13.66,
    cabins: 4,
    berths: 10,
    heads: 4,
    weeklyBaseMinor: 640_000,
  },
  {
    id: "mdl_nautitech_46",
    builderId: "bld_nautitech",
    name: "Nautitech 46 Open",
    displayName: "Nautitech 46 Open",
    categoryId: "cat_catamaran",
    lengthM: 13.99,
    cabins: 4,
    berths: 10,
    heads: 4,
    weeklyBaseMinor: 660_000,
  },

  // Sailing yachts
  {
    id: "mdl_bavaria_c45",
    builderId: "bld_bavaria",
    name: "C45",
    displayName: "Bavaria C45",
    categoryId: "cat_sailing",
    lengthM: 13.98,
    cabins: 4,
    berths: 8,
    heads: 3,
    weeklyBaseMinor: 390_000,
  },
  {
    id: "mdl_bavaria_c38",
    builderId: "bld_bavaria",
    name: "C38",
    displayName: "Bavaria C38",
    categoryId: "cat_sailing",
    lengthM: 11.31,
    cabins: 3,
    berths: 8,
    heads: 2,
    weeklyBaseMinor: 280_000,
  },
  {
    id: "mdl_bavaria_c50",
    builderId: "bld_bavaria",
    name: "C50",
    displayName: "Bavaria C50",
    categoryId: "cat_sailing",
    lengthM: 15.45,
    cabins: 5,
    berths: 10,
    heads: 3,
    weeklyBaseMinor: 470_000,
  },
  {
    id: "mdl_oceanis_461",
    builderId: "bld_beneteau",
    name: "Oceanis 46.1",
    displayName: "Beneteau Oceanis 46.1",
    categoryId: "cat_sailing",
    lengthM: 14.6,
    cabins: 4,
    berths: 10,
    heads: 3,
    weeklyBaseMinor: 495_000,
  },
  {
    id: "mdl_oceanis_403",
    builderId: "bld_beneteau",
    name: "Oceanis 40.1",
    displayName: "Beneteau Oceanis 40.1",
    categoryId: "cat_sailing",
    lengthM: 12.43,
    cabins: 3,
    berths: 8,
    heads: 2,
    weeklyBaseMinor: 330_000,
  },
  {
    id: "mdl_oceanis_51",
    builderId: "bld_beneteau",
    name: "Oceanis 51.1",
    displayName: "Beneteau Oceanis 51.1",
    categoryId: "cat_sailing",
    lengthM: 15.94,
    cabins: 5,
    berths: 12,
    heads: 4,
    weeklyBaseMinor: 560_000,
  },
  {
    id: "mdl_dufour_470",
    builderId: "bld_dufour",
    name: "470",
    displayName: "Dufour 470",
    categoryId: "cat_sailing",
    lengthM: 14.85,
    cabins: 4,
    berths: 10,
    heads: 4,
    weeklyBaseMinor: 490_000,
  },
  {
    id: "mdl_dufour_430",
    builderId: "bld_dufour",
    name: "430",
    displayName: "Dufour 430",
    categoryId: "cat_sailing",
    lengthM: 13.35,
    cabins: 4,
    berths: 10,
    heads: 2,
    weeklyBaseMinor: 380_000,
  },
  {
    id: "mdl_sun_odyssey_410",
    builderId: "bld_jeanneau",
    name: "Sun Odyssey 410",
    displayName: "Jeanneau Sun Odyssey 410",
    categoryId: "cat_sailing",
    lengthM: 12.35,
    cabins: 3,
    berths: 8,
    heads: 2,
    weeklyBaseMinor: 320_000,
  },
  {
    id: "mdl_sun_odyssey_490",
    builderId: "bld_jeanneau",
    name: "Sun Odyssey 490",
    displayName: "Jeanneau Sun Odyssey 490",
    categoryId: "cat_sailing",
    lengthM: 14.75,
    cabins: 5,
    berths: 10,
    heads: 3,
    weeklyBaseMinor: 480_000,
  },
  {
    id: "mdl_hanse_460",
    builderId: "bld_hanse",
    name: "Hanse 460",
    displayName: "Hanse 460",
    categoryId: "cat_sailing",
    lengthM: 14.14,
    cabins: 4,
    berths: 10,
    heads: 3,
    weeklyBaseMinor: 450_000,
  },
  {
    id: "mdl_hanse_418",
    builderId: "bld_hanse",
    name: "Hanse 418",
    displayName: "Hanse 418",
    categoryId: "cat_sailing",
    lengthM: 12.4,
    cabins: 3,
    berths: 8,
    heads: 2,
    weeklyBaseMinor: 330_000,
  },
  {
    id: "mdl_elan_impression_43",
    builderId: "bld_elan",
    name: "Impression 43",
    displayName: "Elan Impression 43",
    categoryId: "cat_sailing",
    lengthM: 13.35,
    cabins: 4,
    berths: 10,
    heads: 3,
    weeklyBaseMinor: 360_000,
  },

  // Motor yachts
  {
    id: "mdl_prestige_520",
    builderId: "bld_prestige",
    name: "520",
    displayName: "Prestige 520",
    categoryId: "cat_motor",
    lengthM: 16.11,
    cabins: 3,
    berths: 6,
    heads: 2,
    weeklyBaseMinor: 1_260_000,
  },
  {
    id: "mdl_prestige_460",
    builderId: "bld_prestige",
    name: "460",
    displayName: "Prestige 460",
    categoryId: "cat_motor",
    lengthM: 14.31,
    cabins: 3,
    berths: 6,
    heads: 2,
    weeklyBaseMinor: 960_000,
  },
  {
    id: "mdl_azimut_55",
    builderId: "bld_azimut",
    name: "Azimut 55",
    displayName: "Azimut 55 Flybridge",
    categoryId: "cat_motor",
    lengthM: 16.7,
    cabins: 3,
    berths: 6,
    heads: 3,
    weeklyBaseMinor: 1_480_000,
  },
  {
    id: "mdl_azimut_43",
    builderId: "bld_azimut",
    name: "Azimut 43",
    displayName: "Azimut 43 Magellano",
    categoryId: "cat_motor",
    lengthM: 13.36,
    cabins: 3,
    berths: 6,
    heads: 2,
    weeklyBaseMinor: 890_000,
  },
  {
    id: "mdl_sunseeker_predator_50",
    builderId: "bld_sunseeker",
    name: "Predator 50",
    displayName: "Sunseeker Predator 50",
    categoryId: "cat_motor",
    lengthM: 15.5,
    cabins: 3,
    berths: 6,
    heads: 2,
    weeklyBaseMinor: 1_390_000,
  },

  // Luxury
  {
    id: "mdl_sunreef_60",
    builderId: "bld_sunreef",
    name: "Sunreef 60",
    displayName: "Sunreef 60",
    categoryId: "cat_luxury",
    lengthM: 18.3,
    cabins: 5,
    berths: 10,
    heads: 5,
    weeklyBaseMinor: 2_140_000,
  },
  {
    id: "mdl_sunreef_80",
    builderId: "bld_sunreef",
    name: "Sunreef 80",
    displayName: "Sunreef 80",
    categoryId: "cat_luxury",
    lengthM: 24.0,
    cabins: 6,
    berths: 12,
    heads: 6,
    weeklyBaseMinor: 4_600_000,
  },
  {
    id: "mdl_ferretti_720",
    builderId: "bld_ferretti",
    name: "720",
    displayName: "Ferretti 720",
    categoryId: "cat_luxury",
    lengthM: 21.9,
    cabins: 4,
    berths: 8,
    heads: 4,
    weeklyBaseMinor: 3_400_000,
  },
  {
    id: "mdl_sunseeker_86",
    builderId: "bld_sunseeker",
    name: "86 Yacht",
    displayName: "Sunseeker 86 Yacht",
    categoryId: "cat_luxury",
    lengthM: 26.4,
    cabins: 5,
    berths: 10,
    heads: 5,
    weeklyBaseMinor: 5_200_000,
  },
] as const;

const models = modelCatalog.map(({ id, builderId, name }) => ({ id, builderId, name }));

const categories = [
  { id: "cat_catamaran", code: "catamaran", name: "Catamaran" },
  { id: "cat_sailing", code: "sailing-yacht", name: "Sailing yacht" },
  { id: "cat_motor", code: "motor-yacht", name: "Motor yacht" },
  { id: "cat_luxury", code: "luxury-yacht", name: "Luxury yacht" },
];

/*
 * Editorial copy for the home page's destination and boat-type cards.
 *
 * Image paths are served by apps/web from public/assets; swap them for absolute CDN
 * URLs once the assets move off the app.
 */
const facetMediaEntries = [
  {
    id: "fcm_country_hr",
    kind: "country" as const,
    value: "Croatia",
    imageUrl: "/assets/home/destinations/croatia.webp",
    description: "A thousand islands, short hops between them, and marinas everywhere you look.",
    sortOrder: 1,
  },
  {
    id: "fcm_country_gr",
    kind: "country" as const,
    value: "Greece",
    imageUrl: "/assets/home/destinations/greece.webp",
    description: "Cyclades meltemi sailing, Ionian calm, and a taverna at every anchorage.",
    sortOrder: 2,
  },
  {
    id: "fcm_country_it",
    kind: "country" as const,
    value: "Italy",
    imageUrl: "/assets/home/destinations/italy.webp",
    description: "The Amalfi coastline, Sardinia's coves, and Sicily's volcanic islands.",
    sortOrder: 3,
  },
  {
    id: "fcm_country_es",
    kind: "country" as const,
    value: "Spain",
    imageUrl: "/assets/home/destinations/caribbean.webp",
    description: "Balearic beach clubs and quiet Menorcan bays within a day's sail.",
    sortOrder: 4,
  },
  {
    id: "fcm_country_th",
    kind: "country" as const,
    value: "Thailand",
    imageUrl: "/assets/home/destinations/caribbean.webp",
    description: "Limestone islands off Phuket, warm water, and year-round sailing.",
    sortOrder: 5,
  },
  {
    id: "fcm_category_catamaran",
    kind: "category" as const,
    value: "Catamaran",
    imageUrl: "/assets/home/boat-types/catamaran.webp",
    description: "Stable, wide, and shallow-draft. The family and group default.",
    sortOrder: 1,
  },
  {
    id: "fcm_category_sailing",
    kind: "category" as const,
    value: "Sailing yacht",
    imageUrl: "/assets/home/boat-types/sailing-yacht.webp",
    description: "The classic monohull charter. Best value per cabin under sail.",
    sortOrder: 2,
  },
  {
    id: "fcm_category_motor",
    kind: "category" as const,
    value: "Motor yacht",
    imageUrl: "/assets/home/boat-types/motor-yacht.webp",
    description: "Cover more coast per day, with no sailing experience required.",
    sortOrder: 3,
  },
  {
    id: "fcm_category_luxury",
    kind: "category" as const,
    value: "Luxury yacht",
    imageUrl: "/assets/home/boat-types/luxury-yacht.webp",
    description: "Crewed, fully catered, and specified to hotel standard.",
    sortOrder: 4,
  },
  {
    id: "fcm_region_dalmatia",
    kind: "region" as const,
    value: "Dalmatia",
    imageUrl: "/assets/home/sailing-routes/dalmatian-coast.webp",
    description: "Split, Hvar, and Vis on a week-long loop.",
    sortOrder: 1,
  },
  {
    id: "fcm_region_cyclades",
    kind: "region" as const,
    value: "Cyclades",
    imageUrl: "/assets/home/sailing-routes/greek-cyclades.webp",
    description: "Open passages, strong summer wind, and whitewashed harbours.",
    sortOrder: 2,
  },
  {
    id: "fcm_region_campania",
    kind: "region" as const,
    value: "Campania",
    imageUrl: "/assets/home/sailing-routes/amalfi-coast.webp",
    description: "Capri, Positano, and the Amalfi cliffs from the water.",
    sortOrder: 3,
  },
];

/*
 * uk and es copy for the cards above; en lives on the facet_media row itself.
 * `label` overrides the display name only — the facet's `value` stays English-derived
 * because it is what the search filters match on.
 */
const facetMediaTranslations = [
  {
    facetMediaId: "fcm_country_hr",
    locale: "uk",
    label: "Хорватія",
    description: "Тисяча островів, короткі переходи між ними і марина майже в кожній бухті.",
  },
  {
    facetMediaId: "fcm_country_hr",
    locale: "es",
    label: "Croacia",
    description: "Mil islas, travesías cortas entre ellas y puertos deportivos por todas partes.",
  },
  {
    facetMediaId: "fcm_country_gr",
    locale: "uk",
    label: "Греція",
    description: "Мельтемі на Кікладах, спокій Іонічного моря і таверна на кожній стоянці.",
  },
  {
    facetMediaId: "fcm_country_gr",
    locale: "es",
    label: "Grecia",
    description:
      "El meltemi de las Cícladas, la calma del Jónico y una taberna en cada fondeadero.",
  },
  {
    facetMediaId: "fcm_country_it",
    locale: "uk",
    label: "Італія",
    description: "Амальфітанське узбережжя, бухти Сардинії та вулканічні острови Сицилії.",
  },
  {
    facetMediaId: "fcm_country_it",
    locale: "es",
    label: "Italia",
    description: "La costa de Amalfi, las calas de Cerdeña y las islas volcánicas de Sicilia.",
  },
  {
    facetMediaId: "fcm_country_es",
    locale: "uk",
    label: "Іспанія",
    description: "Пляжні клуби Балеар і тихі бухти Менорки за один день переходу.",
  },
  {
    facetMediaId: "fcm_country_es",
    locale: "es",
    label: "España",
    description:
      "Clubes de playa en Baleares y calas tranquilas de Menorca a un día de navegación.",
  },
  {
    facetMediaId: "fcm_country_th",
    locale: "uk",
    label: "Таїланд",
    description: "Вапнякові острови біля Пхукета, тепла вода і сезон цілий рік.",
  },
  {
    facetMediaId: "fcm_country_th",
    locale: "es",
    label: "Tailandia",
    description: "Islas calizas frente a Phuket, agua cálida y navegación todo el año.",
  },
  {
    facetMediaId: "fcm_category_catamaran",
    locale: "uk",
    label: "Катамаран",
    description: "Стійкий, просторий, з малою осадкою. Типовий вибір для сімʼї та компанії.",
  },
  {
    facetMediaId: "fcm_category_catamaran",
    locale: "es",
    label: "Catamarán",
    description: "Estable, amplio y de poco calado. La opción habitual para familias y grupos.",
  },
  {
    facetMediaId: "fcm_category_sailing",
    locale: "uk",
    label: "Вітрильна яхта",
    description: "Класичний однокорпусник. Найкраща ціна за каюту під вітрилами.",
  },
  {
    facetMediaId: "fcm_category_sailing",
    locale: "es",
    label: "Velero",
    description: "El monocasco clásico de alquiler. La mejor relación precio por camarote.",
  },
  {
    facetMediaId: "fcm_category_motor",
    locale: "uk",
    label: "Моторна яхта",
    description: "Більше узбережжя за день, досвід керування вітрилами не потрібен.",
  },
  {
    facetMediaId: "fcm_category_motor",
    locale: "es",
    label: "Yate a motor",
    description: "Más costa por día y sin necesidad de experiencia a vela.",
  },
  {
    facetMediaId: "fcm_category_luxury",
    locale: "uk",
    label: "Люкс-яхта",
    description: "З екіпажем, повним харчуванням і рівнем оснащення готелю.",
  },
  {
    facetMediaId: "fcm_category_luxury",
    locale: "es",
    label: "Yate de lujo",
    description: "Con tripulación, pensión completa y equipamiento de nivel hotelero.",
  },
  {
    facetMediaId: "fcm_region_dalmatia",
    locale: "uk",
    label: "Далмація",
    description: "Спліт, Хвар і Віс за тиждень по колу.",
  },
  {
    facetMediaId: "fcm_region_dalmatia",
    locale: "es",
    label: "Dalmacia",
    description: "Split, Hvar y Vis en un circuito de una semana.",
  },
  {
    facetMediaId: "fcm_region_cyclades",
    locale: "uk",
    label: "Кіклади",
    description: "Відкриті переходи, сильний літній вітер і білені гавані.",
  },
  {
    facetMediaId: "fcm_region_cyclades",
    locale: "es",
    label: "Cícladas",
    description: "Travesías abiertas, viento fuerte en verano y puertos encalados.",
  },
  {
    facetMediaId: "fcm_region_campania",
    locale: "uk",
    label: "Кампанія",
    description: "Капрі, Позітано і скелі Амальфі з боку моря.",
  },
  {
    facetMediaId: "fcm_region_campania",
    locale: "es",
    label: "Campania",
    description: "Capri, Positano y los acantilados de Amalfi desde el agua.",
  },
];

const amenityCategories = [
  { id: "amc_comfort", name: "Comfort" },
  { id: "amc_equipment", name: "Equipment" },
  { id: "amc_systems", name: "Systems" },
  { id: "amc_leisure", name: "Leisure" },
  { id: "amc_navigation", name: "Navigation" },
];

const amenities = [
  {
    id: "amn_ac",
    amenityCategoryId: "amc_comfort",
    code: "air-conditioning",
    name: "Air conditioning",
  },
  { id: "amn_dinghy", amenityCategoryId: "amc_equipment", code: "dinghy", name: "Dinghy" },
  { id: "amn_wifi", amenityCategoryId: "amc_comfort", code: "wifi", name: "Wi-Fi" },
  { id: "amn_generator", amenityCategoryId: "amc_systems", code: "generator", name: "Generator" },
  {
    id: "amn_watermaker",
    amenityCategoryId: "amc_systems",
    code: "watermaker",
    name: "Watermaker",
  },
  { id: "amn_solar", amenityCategoryId: "amc_systems", code: "solar-panels", name: "Solar panels" },
  { id: "amn_sup", amenityCategoryId: "amc_leisure", code: "sup", name: "Stand-up paddleboard" },
  { id: "amn_snorkel", amenityCategoryId: "amc_leisure", code: "snorkel", name: "Snorkeling set" },
  { id: "amn_grill", amenityCategoryId: "amc_comfort", code: "grill", name: "Cockpit grill" },
  {
    id: "amn_autopilot",
    amenityCategoryId: "amc_navigation",
    code: "autopilot",
    name: "Autopilot",
  },
  {
    id: "amn_cleaning_fee",
    amenityCategoryId: "amc_comfort",
    code: "cleaning-fee",
    name: "Cleaning fee",
  },
  {
    id: "amn_transit_log",
    amenityCategoryId: "amc_equipment",
    code: "transit-log",
    name: "Transit log",
  },
  // Codes match the crew lines the mock provider prices, so a quote's crew rows
  // and the listing's crew roles line up by code rather than by label.
  {
    id: "amn_skipper",
    amenityCategoryId: "amc_comfort",
    code: "skipper",
    name: "Skipper",
    crew: true,
  },
  {
    id: "amn_hostess",
    amenityCategoryId: "amc_comfort",
    code: "hostess",
    name: "Hostess",
    crew: true,
  },
  {
    id: "amn_cook",
    amenityCategoryId: "amc_comfort",
    code: "cook",
    name: "Cook",
    crew: true,
  },
  {
    id: "amn_marina_fees",
    amenityCategoryId: "amc_equipment",
    code: "marina-fees",
    name: "Harbor and marina fees",
  },
  {
    id: "amn_sunbathing_area",
    amenityCategoryId: "amc_comfort",
    code: "sunbathing-area",
    name: "Spacious sunbathing area",
  },
  {
    id: "amn_gas_bbq",
    amenityCategoryId: "amc_comfort",
    code: "gas-bbq",
    name: "Gas BBQ",
  },
  {
    id: "amn_hot_tub",
    amenityCategoryId: "amc_leisure",
    code: "hot-tub",
    name: "Hot tub",
  },
];

type YachtSeed = {
  externalId: string;
  listingId: string;
  sourceId: string;
  recordId: string;
  rawPayloadId: string;
  slug: string;
  title: string;
  operatorId: string;
  baseId: string;
  builderId: string;
  modelId: string;
  categoryId: string;
  lengthM: string;
  yearBuilt: number;
  cabins: number;
  berths: number;
  heads: number;
  amenityIds: string[];
  media: string[];
  rating: number;
  reviewAuthor: string;
  reviewBody: string;
};

/** Hand-written listings kept verbatim so their slugs and ids stay stable. */
const curatedYachts: YachtSeed[] = [
  {
    externalId: "yacht-lagoon-42-aurora",
    listingId: "ylst_yacht-lagoon-42-aurora",
    sourceId: "lsrc_lagoon_42_aurora",
    recordId: "prec_lagoon_42_aurora",
    rawPayloadId: "praw_lagoon_42_aurora",
    slug: "aurora-lagoon-42-split",
    title: "Aurora Lagoon 42",
    operatorId: "op_adriatic",
    baseId: "base_split",
    builderId: "bld_lagoon",
    modelId: "mdl_lagoon_42",
    categoryId: "cat_catamaran",
    lengthM: "12.80",
    yearBuilt: 2022,
    cabins: 4,
    berths: 10,
    heads: 4,
    amenityIds: ["amn_ac", "amn_dinghy", "amn_wifi", "amn_solar", "amn_sup"],
    media: [
      "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a",
      "https://images.unsplash.com/photo-1540946485063-a40da27545f8",
      "https://images.unsplash.com/photo-1569263979104-865ab7cd8d13",
    ],
    rating: 5,
    reviewAuthor: "Marta K.",
    reviewBody: "Clean handover, accurate photos, and a smooth week aboard.",
  },
  {
    externalId: "yacht-bavaria-c45-luna",
    listingId: "ylst_yacht-bavaria-c45-luna",
    sourceId: "lsrc_bavaria_c45_luna",
    recordId: "prec_bavaria_c45_luna",
    rawPayloadId: "praw_bavaria_c45_luna",
    slug: "luna-c45-athens",
    title: "Luna C45",
    operatorId: "op_aegean",
    baseId: "base_athens",
    builderId: "bld_bavaria",
    modelId: "mdl_bavaria_c45",
    categoryId: "cat_sailing",
    lengthM: "13.98",
    yearBuilt: 2021,
    cabins: 4,
    berths: 8,
    heads: 3,
    amenityIds: ["amn_dinghy", "amn_wifi", "amn_autopilot", "amn_solar"],
    media: [
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
      "https://images.unsplash.com/photo-1528154291023-a6525fabe5b4",
    ],
    rating: 5,
    reviewAuthor: "Ivan P.",
    reviewBody: "A practical yacht for a family route through the Saronic islands.",
  },
  {
    externalId: "yacht-sunreef-60-celeste",
    listingId: "ylst_yacht-sunreef-60-celeste",
    sourceId: "lsrc_sunreef_60_celeste",
    recordId: "prec_sunreef_60_celeste",
    rawPayloadId: "praw_sunreef_60_celeste",
    slug: "celeste-sunreef-60-amalfi-coast",
    title: "Celeste Sunreef 60",
    operatorId: "op_med_premium",
    baseId: "base_amalfi",
    builderId: "bld_sunreef",
    modelId: "mdl_sunreef_60",
    categoryId: "cat_luxury",
    lengthM: "18.30",
    yearBuilt: 2023,
    cabins: 5,
    berths: 10,
    heads: 5,
    amenityIds: ["amn_ac", "amn_generator", "amn_watermaker", "amn_wifi", "amn_sup", "amn_snorkel"],
    media: [
      "https://images.unsplash.com/photo-1520333789090-1afc82db536a",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
      "https://images.unsplash.com/photo-1519046904884-53103b34b206",
    ],
    rating: 5,
    reviewAuthor: "Sofia R.",
    reviewBody:
      "A polished crewed option for Amalfi with generous cabins and excellent deck space.",
  },
  {
    externalId: "yacht-oceanis-461-maribel",
    listingId: "ylst_yacht-oceanis-461-maribel",
    sourceId: "lsrc_oceanis_461_maribel",
    recordId: "prec_oceanis_461_maribel",
    rawPayloadId: "praw_oceanis_461_maribel",
    slug: "maribel-oceanis-461-dubrovnik",
    title: "Maribel Oceanis 46.1",
    operatorId: "op_adriatic",
    baseId: "base_dubrovnik",
    builderId: "bld_beneteau",
    modelId: "mdl_oceanis_461",
    categoryId: "cat_sailing",
    lengthM: "14.60",
    yearBuilt: 2019,
    cabins: 4,
    berths: 10,
    heads: 3,
    amenityIds: ["amn_wifi", "amn_dinghy", "amn_autopilot", "amn_grill"],
    media: [
      "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2",
      "https://images.unsplash.com/photo-1534008897995-27a23e859048",
    ],
    rating: 5,
    reviewAuthor: "Luka M.",
    reviewBody: "Easy to sail, clean below deck, and well placed for the Elaphiti islands.",
  },
  {
    externalId: "yacht-lagoon-52f-solenne",
    listingId: "ylst_yacht-lagoon-52f-solenne",
    sourceId: "lsrc_lagoon_52f_solenne",
    recordId: "prec_lagoon_52f_solenne",
    rawPayloadId: "praw_lagoon_52f_solenne",
    slug: "solenne-lagoon-52-f-dubrovnik",
    title: "Solenne Lagoon 52 F",
    operatorId: "op_adriatic",
    baseId: "base_dubrovnik",
    builderId: "bld_lagoon",
    modelId: "mdl_lagoon_52f",
    categoryId: "cat_catamaran",
    lengthM: "15.84",
    yearBuilt: 2020,
    cabins: 6,
    berths: 12,
    heads: 4,
    amenityIds: ["amn_ac", "amn_generator", "amn_watermaker", "amn_wifi", "amn_sup", "amn_grill"],
    media: [
      "https://images.unsplash.com/photo-1551632811-561732d1e306",
      "https://images.unsplash.com/photo-1540541338287-41700207dee6",
    ],
    rating: 5,
    reviewAuthor: "Nina T.",
    reviewBody:
      "A strong choice for two families who want space without moving into superyacht pricing.",
  },
  {
    externalId: "yacht-bavaria-c38-niki",
    listingId: "ylst_yacht-bavaria-c38-niki",
    sourceId: "lsrc_bavaria_c38_niki",
    recordId: "prec_bavaria_c38_niki",
    rawPayloadId: "praw_bavaria_c38_niki",
    slug: "niki-c38-mykonos",
    title: "Niki C38",
    operatorId: "op_aegean",
    baseId: "base_mykonos",
    builderId: "bld_bavaria",
    modelId: "mdl_bavaria_c38",
    categoryId: "cat_sailing",
    lengthM: "11.31",
    yearBuilt: 2022,
    cabins: 3,
    berths: 8,
    heads: 2,
    amenityIds: ["amn_wifi", "amn_dinghy", "amn_solar", "amn_autopilot"],
    media: [
      "https://images.unsplash.com/photo-1533104816931-20fa691ff6ca",
      "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429",
    ],
    rating: 4,
    reviewAuthor: "Elena D.",
    reviewBody: "Compact, modern, and practical for Cyclades hops with a skipper.",
  },
  {
    externalId: "yacht-dufour-470-brisa",
    listingId: "ylst_yacht-dufour-470-brisa",
    sourceId: "lsrc_dufour_470_brisa",
    recordId: "prec_dufour_470_brisa",
    rawPayloadId: "praw_dufour_470_brisa",
    slug: "brisa-dufour-470-palma",
    title: "Brisa Dufour 470",
    operatorId: "op_island_route",
    baseId: "base_palma",
    builderId: "bld_dufour",
    modelId: "mdl_dufour_470",
    categoryId: "cat_sailing",
    lengthM: "14.85",
    yearBuilt: 2021,
    cabins: 4,
    berths: 10,
    heads: 4,
    amenityIds: ["amn_ac", "amn_wifi", "amn_dinghy", "amn_grill", "amn_autopilot"],
    media: [
      "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429",
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
    ],
    rating: 5,
    reviewAuthor: "Clara S.",
    reviewBody: "Balanced cockpit, good galley, and a comfortable base for Mallorca coves.",
  },
  {
    externalId: "yacht-elba-45-sabai",
    listingId: "ylst_yacht-elba-45-sabai",
    sourceId: "lsrc_elba_45_sabai",
    recordId: "prec_elba_45_sabai",
    rawPayloadId: "praw_elba_45_sabai",
    slug: "sabai-elba-45-ao-po",
    title: "Sabai Elba 45",
    operatorId: "op_island_route",
    baseId: "base_phuket",
    builderId: "bld_fountaine_pajot",
    modelId: "mdl_elba_45",
    categoryId: "cat_catamaran",
    lengthM: "13.45",
    yearBuilt: 2019,
    cabins: 4,
    berths: 12,
    heads: 4,
    amenityIds: ["amn_ac", "amn_watermaker", "amn_wifi", "amn_sup", "amn_snorkel"],
    media: [
      "https://images.unsplash.com/photo-1537956965359-7573183d1f57",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
    ],
    rating: 5,
    reviewAuthor: "Anya V.",
    reviewBody: "Excellent for warm-water cruising with plenty of shaded social space.",
  },
  {
    externalId: "yacht-sun-odyssey-410-maestral",
    listingId: "ylst_yacht-sun-odyssey-410-maestral",
    sourceId: "lsrc_sun_odyssey_410_maestral",
    recordId: "prec_sun_odyssey_410_maestral",
    rawPayloadId: "praw_sun_odyssey_410_maestral",
    slug: "maestral-sun-odyssey-410-split",
    title: "Maestral Sun Odyssey 410",
    operatorId: "op_adriatic",
    baseId: "base_split",
    builderId: "bld_jeanneau",
    modelId: "mdl_sun_odyssey_410",
    categoryId: "cat_sailing",
    lengthM: "12.35",
    yearBuilt: 2018,
    cabins: 3,
    berths: 8,
    heads: 2,
    amenityIds: ["amn_wifi", "amn_dinghy", "amn_solar", "amn_autopilot"],
    media: [
      "https://images.unsplash.com/photo-1540946485063-a40da27545f8",
      "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2",
    ],
    rating: 4,
    reviewAuthor: "Petra B.",
    reviewBody: "Straightforward sailing yacht with predictable handling and a helpful base team.",
  },
  {
    externalId: "yacht-prestige-520-velvet",
    listingId: "ylst_yacht-prestige-520-velvet",
    sourceId: "lsrc_prestige_520_velvet",
    recordId: "prec_prestige_520_velvet",
    rawPayloadId: "praw_prestige_520_velvet",
    slug: "velvet-prestige-520-amalfi-coast",
    title: "Velvet Prestige 520",
    operatorId: "op_med_premium",
    baseId: "base_amalfi",
    builderId: "bld_prestige",
    modelId: "mdl_prestige_520",
    categoryId: "cat_motor",
    lengthM: "16.11",
    yearBuilt: 2022,
    cabins: 3,
    berths: 6,
    heads: 2,
    amenityIds: ["amn_ac", "amn_generator", "amn_watermaker", "amn_wifi", "amn_snorkel"],
    media: [
      "https://images.unsplash.com/photo-1569263979104-865ab7cd8d13",
      "https://images.unsplash.com/photo-1520333789090-1afc82db536a",
    ],
    rating: 5,
    reviewAuthor: "Marco L.",
    reviewBody: "A premium short-hop motor yacht for Amalfi, Capri, and restaurant-focused days.",
  },
];

const TARGET_FLEET_SIZE = 72;

/** Deterministic PRNG so repeated seeds produce byte-identical fleets. */
const createRandom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const key = (value: string) => value.replaceAll("-", "_");

const yachtNames = [
  "Alba",
  "Amaranta",
  "Anemone",
  "Arcadia",
  "Ariadne",
  "Azzurra",
  "Bellamare",
  "Bora",
  "Calypso",
  "Caravel",
  "Cassiopeia",
  "Cirrus",
  "Corallia",
  "Cortona",
  "Cygnus",
  "Delphine",
  "Ember",
  "Eos",
  "Esperanza",
  "Estrella",
  "Farfalla",
  "Fiora",
  "Galatea",
  "Gaviota",
  "Halcyon",
  "Helios",
  "Iolanda",
  "Isolde",
  "Jadran",
  "Kalypso",
  "Kestrel",
  "Levanto",
  "Liburna",
  "Lucente",
  "Marea",
  "Marisol",
  "Meltemi",
  "Mistral",
  "Nautilus",
  "Nerea",
  "Nimbus",
  "Ondina",
  "Orsa",
  "Pelagia",
  "Perla",
  "Ponente",
  "Quilla",
  "Rialto",
  "Salina",
  "Selene",
  "Serenata",
  "Sirocco",
  "Solaris",
  "Sorrento",
  "Stellaria",
  "Talisman",
  "Tramontana",
  "Ulisse",
  "Vela",
  "Ventura",
  "Verano",
  "Vespera",
  "Zefiro",
  "Zenobia",
  "Adriana",
  "Bellona",
  "Cyrene",
  "Dorada",
  "Elysia",
  "Fjordana",
  "Ginestra",
  "Halia",
  "Ismera",
  "Jolanda",
  "Korcula",
  "Lisandra",
  "Marbella",
  "Nautica",
  "Oceania",
  "Primavera",
];

const mediaPool = [
  "https://images.unsplash.com/photo-1567899378494-47b22a2ae96a",
  "https://images.unsplash.com/photo-1540946485063-a40da27545f8",
  "https://images.unsplash.com/photo-1569263979104-865ab7cd8d13",
  "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
  "https://images.unsplash.com/photo-1528154291023-a6525fabe5b4",
  "https://images.unsplash.com/photo-1520333789090-1afc82db536a",
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
  "https://images.unsplash.com/photo-1519046904884-53103b34b206",
  "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2",
  "https://images.unsplash.com/photo-1534008897995-27a23e859048",
  "https://images.unsplash.com/photo-1551632811-561732d1e306",
  "https://images.unsplash.com/photo-1540541338287-41700207dee6",
  "https://images.unsplash.com/photo-1533104816931-20fa691ff6ca",
  "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429",
  "https://images.unsplash.com/photo-1537956965359-7573183d1f57",
  "https://images.unsplash.com/photo-1544551763-46a013bb70d5",
];

const featureAmenityIds = [
  "amn_ac",
  "amn_dinghy",
  "amn_wifi",
  "amn_generator",
  "amn_watermaker",
  "amn_solar",
  "amn_sup",
  "amn_snorkel",
  "amn_grill",
  "amn_autopilot",
];

const reviewAuthors = [
  "Marta K.",
  "Ivan P.",
  "Sofia R.",
  "Luka M.",
  "Nina T.",
  "Elena D.",
  "Clara S.",
  "Anya V.",
  "Petra B.",
  "Marco L.",
  "Tomas H.",
  "Giulia F.",
  "Nikos A.",
  "Lena W.",
  "Pierre G.",
  "Ana C.",
  "David O.",
  "Marija S.",
  "Julien R.",
  "Katrin B.",
  "Stefano M.",
  "Hanna L.",
  "Diego N.",
  "Irene P.",
];

const reviewBodies = [
  "Smooth handover, tidy interior, and a base team that answered on the first call.",
  "Well maintained for its age and exactly as described in the listing.",
  "Comfortable layout for two couples, with enough deck space to stay out of each other's way.",
  "Good sail wardrobe and a briefing that covered the route properly.",
  "Clean below deck, working electronics, and no surprises at check-in.",
  "Plenty of shade in the cockpit, which mattered more than we expected in August.",
  "Handled the afternoon breeze predictably and the fridge kept up all week.",
  "Roomy cabins, quiet generator, and a fair deposit process at return.",
];

// SAFETY: every caller passes one of the non-empty fixture arrays above, and
// `index % items.length` is always inside a non-empty array. noUncheckedIndexedAccess
// still widens the element to `T | undefined`.
const pick = <T>(items: readonly T[], index: number) => items[index % items.length] as T;

/** Unlike pick(), a lookup that can genuinely miss — a bad reference must not seed. */
const required = <T>(item: T | undefined, label: string): T => {
  if (item === undefined) throw new Error(`Seed fixtures are inconsistent: ${label}`);
  return item;
};

const generatedYachts: YachtSeed[] = Array.from(
  { length: Math.max(0, TARGET_FLEET_SIZE - curatedYachts.length) },
  (_, index) => {
    const random = createRandom(index * 7919 + 104_729);
    const model = modelCatalog[(index * 5 + 3) % modelCatalog.length]!;
    const homeBase = bases[(index * 3 + 1) % bases.length]!;
    const name = yachtNames[(index * 11 + 5) % yachtNames.length]!;

    const title = `${name} ${model.displayName}`;
    const location = required(
      locations.find((item) => item.id === homeBase.locationId),
      `base ${homeBase.id} points at unknown location ${homeBase.locationId}`,
    );
    const slug = slugify(`${name}-${model.displayName}-${location.name}`);
    const externalId = `yacht-${slugify(`${model.displayName}-${name}`)}`;
    const listingId = `ylst_${externalId}`;
    const entityKey = key(externalId.replace("yacht-", ""));

    const berthDelta = random() < 0.3 ? -2 : 0;
    const amenityCount = 3 + Math.floor(random() * 4);
    const amenityStart = Math.floor(random() * featureAmenityIds.length);
    const mediaCount = 2 + Math.floor(random() * 3);
    const mediaStart = Math.floor(random() * mediaPool.length);

    return {
      externalId,
      listingId,
      sourceId: `lsrc_${entityKey}`,
      recordId: `prec_${entityKey}`,
      rawPayloadId: `praw_${entityKey}`,
      slug,
      title,
      operatorId: homeBase.operatorId,
      baseId: homeBase.id,
      builderId: model.builderId,
      modelId: model.id,
      categoryId: model.categoryId,
      lengthM: model.lengthM.toFixed(2),
      yearBuilt: 2016 + Math.floor(random() * 10),
      cabins: model.cabins,
      berths: Math.max(model.cabins * 2, model.berths + berthDelta),
      heads: model.heads,
      amenityIds: Array.from(
        { length: amenityCount },
        (__, offset) => featureAmenityIds[(amenityStart + offset) % featureAmenityIds.length]!,
      ),
      media: Array.from(
        { length: mediaCount },
        (__, offset) => mediaPool[(mediaStart + offset) % mediaPool.length]!,
      ),
      rating: random() < 0.7 ? 5 : 4,
      reviewAuthor: pick(reviewAuthors, index * 5 + 1),
      reviewBody: pick(reviewBodies, index * 3 + 2),
    };
  },
);

const yachts: YachtSeed[] = [...curatedYachts, ...generatedYachts];

const weeklyBaseFor = (modelId: string) =>
  modelCatalog.find((item) => item.id === modelId)?.weeklyBaseMinor ?? 450_000;

/** Saturday-to-Saturday charter weeks covered by the mock availability feed. */
const seasonWeeks = [
  "2026-06-06",
  "2026-06-13",
  "2026-06-20",
  "2026-06-27",
  "2026-07-04",
  "2026-07-11",
  "2026-07-18",
  "2026-07-25",
  "2026-08-01",
  "2026-08-08",
  "2026-08-15",
  "2026-08-22",
  "2026-08-29",
  "2026-09-05",
];

const addWeek = (isoDate: string) => {
  const next = new Date(`${isoDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 7);
  return next.toISOString().slice(0, 10);
};

/** July and August carry the peak multiplier; June and September are shoulder. */
const seasonMultiplier = (startDate: string) => {
  const month = Number(startDate.slice(5, 7));
  if (month === 7 || month === 8) return 1.35;
  if (month === 6 || month === 9) return 1.0;
  return 0.85;
};

const slotStatusFor = (roll: number) => {
  if (roll < 0.62) return "available" as const;
  if (roll < 0.74) return "option" as const;
  if (roll < 0.93) return "occupied" as const;
  return "blocked" as const;
};

const slots = yachts.flatMap((item) => {
  const random = createRandom(
    [...item.externalId].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) >>> 0, 7),
  );
  const weeklyBase = weeklyBaseFor(item.modelId);
  const conditionPremium = 1 + (item.yearBuilt - 2016) * 0.015;

  return seasonWeeks.map((startDate) => {
    const priceMinor =
      Math.round(
        (weeklyBase * seasonMultiplier(startDate) * conditionPremium * (0.94 + random() * 0.12)) /
          1000,
      ) * 1000;

    return {
      id: `${key(item.externalId.replace("yacht-", ""))}_${key(startDate.replaceAll("-", "_"))}`,
      listingId: item.listingId,
      listingSourceId: item.sourceId,
      startDate,
      endDate: addWeek(startDate),
      status: slotStatusFor(random()),
      priceMinor,
    };
  });
});

/*
 * The mock fleet has to carry the same canonical shapes a real sync writes, or the seeded
 * catalogue is unbookable: search filters on free periods and the card's price comes from
 * published rates. Derived from the same weekly slots so the three never disagree.
 */
const SEASON_START = seasonWeeks[0] ?? "";
const SEASON_END = addWeek(seasonWeeks.at(-1) ?? "");

const pricePeriods = slots.map((slot) => ({
  id: `lpp_${slot.id}`,
  listingId: slot.listingId,
  listingSourceId: slot.listingSourceId,
  startDate: slot.startDate,
  endDate: slot.endDate,
  kind: "weekly" as const,
  priceMinor: slot.priceMinor,
  currency: "EUR",
}));

/** The complement of everything sold, exactly as `freePeriodsFrom` computes it after a sync. */
const freePeriods = yachts.flatMap((item) => {
  const sold = slots
    .filter((slot) => slot.listingId === item.listingId && slot.status !== "available")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const periods: { startDate: string; endDate: string }[] = [];
  let cursor = SEASON_START;
  for (const slot of sold) {
    if (slot.startDate > cursor) periods.push({ startDate: cursor, endDate: slot.startDate });
    if (slot.endDate > cursor) cursor = slot.endDate;
  }
  if (cursor < SEASON_END) periods.push({ startDate: cursor, endDate: SEASON_END });

  return periods.map((period, index) => ({
    id: `lfp_${key(item.externalId.replace("yacht-", ""))}_${index}`,
    listingId: item.listingId,
    listingSourceId: item.sourceId,
    ...period,
  }));
});

const crewTypeFor = (categoryId: string) => {
  if (categoryId === "cat_luxury" || categoryId === "cat_motor") return "full-crew";
  if (categoryId === "cat_catamaran") return "skipper";
  return "bareboat";
};

const sailTypeFor = (categoryId: string, yearBuilt: number) => {
  if (categoryId === "cat_motor") return null;
  if (categoryId === "cat_catamaran") return "classic";
  return yearBuilt >= 2021 ? "furling" : "lazy-bag";
};

const hasDepositInsurance = (categoryId: string, yearBuilt: number) =>
  categoryId === "cat_luxury" || yearBuilt >= 2021;

const allowsPets = (baseId: string, categoryId: string) =>
  categoryId !== "cat_luxury" && (baseId.includes("split") || baseId.includes("palma"));

const hasConfirmedAvailability = (slotId: string, status: string) =>
  status !== "available" || !slotId.includes("2026_08_08");

/**
 * The extras a mock listing sells, mirroring the non-crew entries of
 * `packages/providers/src/mock/fixtures/availability.json`.
 *
 * These two lists have to agree, and this file cannot import that fixture because
 * `packages/providers` depends on this package, not the other way round. Keeping
 * them in step is what makes the displayed price the charged one: the mock adds
 * every obligatory extra to a quote whether or not it was selected, so a mandatory
 * extra shown here and absent there would be displayed and never billed, and one
 * there and not here would be billed and never shown.
 *
 * Deliberately the same set for every listing, because the mock prices one global
 * list rather than a per-yacht one.
 */
const MOCK_EXTRAS = [
  { externalId: "transit-log", name: "Transit log", obligatory: true, priceMinor: 25_000 },
  { externalId: "sup", name: "Stand-up paddleboard", obligatory: false, priceMinor: 12_000 },
  { externalId: "early-checkin", name: "Early check-in", obligatory: false, priceMinor: 18_000 },
  { externalId: "safety-net", name: "Safety net", obligatory: false, priceMinor: 15_000 },
] as const;

/**
 * Which crew roles a yacht sells, following how the operator sells the hull: a
 * bareboat charter can hire a skipper, a skippered one can add service crew, and
 * a fully crewed yacht comes with all three. `crewOptionsFor` reads these back to
 * decide what the sidebar's Crew control may offer.
 */
const crewRoleIdsFor = (crewType: string) => {
  if (crewType === "full-crew") return ["amn_skipper", "amn_hostess", "amn_cook"];
  if (crewType === "skipper") return ["amn_skipper", "amn_hostess"];
  return ["amn_skipper"];
};

const crewRolePrice = (amenityId: string) => {
  switch (amenityId) {
    case "amn_skipper":
      return 140_000;
    case "amn_hostess":
      return 105_000;
    case "amn_cook":
      return 120_000;
    default:
      return 0;
  }
};

const specDetailsFor = (item: (typeof yachts)[number]) => ({
  beamM: (Number(item.lengthM) * (item.categoryId === "cat_catamaran" ? 0.58 : 0.28)).toFixed(2),
  draftM: (item.categoryId === "cat_motor" ? 1.05 : 1.25).toFixed(2),
  engines: item.categoryId === "cat_catamaran" ? 2 : 1,
  enginePower: item.categoryId === "cat_motor" ? "2 x 435 hp" : "85 hp",
  fuelCapacity: item.categoryId === "cat_motor" ? 1300 : 600,
  waterCapacity: item.categoryId === "cat_catamaran" ? 700 : 360,
});

/*
 * The loyalty ladder behind the "Your Level" card. Thresholds are chosen so the
 * screen in Figma is reachable: three completed referral bookings puts you in
 * Navigator with two left to Captain, which is exactly what the design shows.
 * Marketing owns these numbers — change them here, not in code.
 */
const loyaltyTiers = [
  {
    id: "tier_sailor",
    code: "sailor",
    name: "Sailor",
    level: 1,
    requiredBookings: 0,
    referralBonusPct: "0",
  },
  {
    id: "tier_navigator",
    code: "navigator",
    name: "Navigator",
    level: 2,
    requiredBookings: 3,
    referralBonusPct: "0.05",
  },
  {
    id: "tier_captain",
    code: "captain",
    name: "Captain",
    level: 3,
    requiredBookings: 5,
    referralBonusPct: "0.10",
  },
  {
    id: "tier_admiral",
    code: "admiral",
    name: "Admiral",
    level: 4,
    requiredBookings: 10,
    referralBonusPct: "0.15",
  },
];

/** `code` matches the i18n keys under Referrals.how.level.perks. */
const loyaltyPerks = [
  {
    id: "perk_extra",
    tierId: "tier_navigator",
    code: "extra",
    label: "5% extra credit on all referrals",
    sortOrder: 0,
  },
  {
    id: "perk_early",
    tierId: "tier_navigator",
    code: "early",
    label: "Early access to luxury deals",
    sortOrder: 1,
  },
  {
    id: "perk_concierge",
    tierId: "tier_captain",
    code: "concierge",
    label: "Personal concierge service",
    sortOrder: 2,
  },
];

const insertStaticData = async () => {
  await db.insert(loyaltyTier).values(loyaltyTiers).onConflictDoNothing();
  await db.insert(loyaltyPerk).values(loyaltyPerks).onConflictDoNothing();
  await db.insert(country).values(countries).onConflictDoNothing();
  await db.insert(region).values(regions).onConflictDoNothing();
  await db.insert(location).values(locations).onConflictDoNothing();
  await db
    .insert(operator)
    .values(
      operators.map(({ id, name, slug, country, city, email, phone }) => ({
        id,
        name,
        slug,
        country,
        city,
        email,
        phone,
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(base)
    .values(
      bases.map(
        ({ id, locationId, name, lat, lng, email, phone, website, checkInTime, checkOutTime }) => ({
          id,
          locationId,
          name,
          lat,
          lng,
          email,
          phone,
          website,
          checkInTime,
          checkOutTime,
        }),
      ),
    )
    .onConflictDoUpdate({
      target: base.id,
      set: {
        email: sql`excluded.email`,
        phone: sql`excluded.phone`,
        website: sql`excluded.website`,
      },
    });
  await db.insert(builder).values(builders).onConflictDoNothing();
  await db.insert(yachtModel).values(models).onConflictDoNothing();
  await db.insert(yachtCategory).values(categories).onConflictDoNothing();
  await db.insert(amenityCategory).values(amenityCategories).onConflictDoNothing();
  await db
    .insert(amenity)
    .values(amenities)
    // The crew flag is re-applied on conflict so re-seeding an older database
    // repairs it; everything else about an amenity is immutable.
    .onConflictDoUpdate({ target: amenity.id, set: { crew: sql`excluded.crew` } });
  await insertFacetMedia();
};

export interface FacetMediaSeedResult {
  facetsSeeded: number;
  translationsSeeded: number;
}

/**
 * Editorial images/descriptions for search filter facets (country, category,
 * region cards). Keyed by (kind, value), not a foreign key against country/
 * yachtCategory/region — see facet-media.ts — so this is safe to run on its own
 * against a database whose catalogue came entirely from a provider sync rather
 * than this file's mock data, without touching anything the sync owns.
 *
 * Exported so a compiled ops entry point (apps/server/src/seed-facets.ts) can
 * call it directly — this file's own CLI path (`pnpm --filter @yacht-charter/db
 * seed -- --facets-only`) needs `tsx` on the machine running it, which a
 * production container may not have; the compiled entry doesn't.
 */
export async function insertFacetMedia(): Promise<FacetMediaSeedResult> {
  await db
    .insert(facetMedia)
    .values(facetMediaEntries)
    .onConflictDoUpdate({
      target: facetMedia.id,
      set: {
        imageUrl: sql`excluded.image_url`,
        description: sql`excluded.description`,
        sortOrder: sql`excluded.sort_order`,
      },
    });
  await db
    .insert(facetMediaTranslation)
    .values(facetMediaTranslations)
    .onConflictDoUpdate({
      target: [facetMediaTranslation.facetMediaId, facetMediaTranslation.locale],
      set: {
        label: sql`excluded.label`,
        description: sql`excluded.description`,
      },
    });

  return {
    facetsSeeded: facetMediaEntries.length,
    translationsSeeded: facetMediaTranslations.length,
  };
}

export async function main() {
  await db
    .insert(provider)
    .values({
      id: providerId,
      code: "mock",
      name: "Mock Inventory Provider",
      enabled: true,
      defaultCurrency: "EUR",
    })
    .onConflictDoNothing();

  await db
    .insert(syncRun)
    .values({
      id: "sync_mock_catalogue",
      providerId,
      kind: "catalogue",
      status: "success",
      createdCount: yachts.length,
      startedAt: new Date(),
      finishedAt: new Date(),
    })
    .onConflictDoNothing();

  await insertStaticData();

  await db
    .insert(providerRawPayload)
    .values(
      yachts.map((item) => ({
        id: item.rawPayloadId,
        providerId,
        payload: { id: item.externalId, name: item.title, baseId: item.baseId },
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(providerRecord)
    .values(
      yachts.map((item) => ({
        id: item.recordId,
        providerId,
        resourceType: "yacht" as const,
        externalId: item.externalId,
        rawPayloadId: item.rawPayloadId,
        sourceHash: `mock-${item.externalId}`,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(listing)
    .values(
      yachts.map((item) => ({
        id: item.listingId,
        slug: item.slug,
        title: item.title,
        operatorId: item.operatorId,
        homeBaseId: item.baseId,
        builderId: item.builderId,
        modelId: item.modelId,
        categoryId: item.categoryId,
        crewType: crewTypeFor(item.categoryId),
        depositInsuranceIncluded: hasDepositInsurance(item.categoryId, item.yearBuilt),
        petsAllowed: allowsPets(item.baseId, item.categoryId),
        defaultCurrency: "EUR",
        status: "published" as const,
        primarySourceId: item.sourceId,
        freshnessAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: listing.id,
      set: {
        crewType: sql.raw("excluded.crew_type"),
        depositInsuranceIncluded: sql.raw("excluded.deposit_insurance_included"),
        petsAllowed: sql.raw("excluded.pets_allowed"),
        defaultCurrency: sql.raw("excluded.default_currency"),
        status: sql.raw("excluded.status"),
        primarySourceId: sql.raw("excluded.primary_source_id"),
        freshnessAt: sql.raw("excluded.freshness_at"),
      },
    });

  await db
    .insert(listingSource)
    .values(
      yachts.map((item) => {
        const homeBase = bases.find((baseItem) => baseItem.id === item.baseId);
        const owningOperator = operators.find(
          (operatorItem) => operatorItem.id === item.operatorId,
        );
        return {
          id: item.sourceId,
          listingId: item.listingId,
          providerRecordId: item.recordId,
          externalYachtId: item.externalId,
          externalCompanyId: owningOperator?.externalCompanyId,
          externalBaseId: homeBase?.externalId,
          matchStatus: "confirmed" as const,
          matchConfidence: "1.0000",
        };
      }),
    )
    .onConflictDoNothing();

  await db
    .insert(listingSpecification)
    .values(
      yachts.map((item) => ({
        id: `lspec_${item.listingId.replace("ylst_yacht-", "").replaceAll("-", "_")}`,
        listingId: item.listingId,
        lengthM: item.lengthM,
        beamM: specDetailsFor(item).beamM,
        draftM: specDetailsFor(item).draftM,
        yearBuilt: item.yearBuilt,
        cabins: item.cabins,
        berths: item.berths,
        heads: item.heads,
        engines: specDetailsFor(item).engines,
        enginePower: specDetailsFor(item).enginePower,
        fuelCapacity: specDetailsFor(item).fuelCapacity,
        waterCapacity: specDetailsFor(item).waterCapacity,
        sailType: sailTypeFor(item.categoryId, item.yearBuilt),
      })),
    )
    .onConflictDoUpdate({
      target: listingSpecification.listingId,
      set: {
        lengthM: sql.raw("excluded.length_m"),
        beamM: sql.raw("excluded.beam_m"),
        draftM: sql.raw("excluded.draft_m"),
        yearBuilt: sql.raw("excluded.year_built"),
        cabins: sql.raw("excluded.cabins"),
        berths: sql.raw("excluded.berths"),
        heads: sql.raw("excluded.heads"),
        engines: sql.raw("excluded.engines"),
        enginePower: sql.raw("excluded.engine_power"),
        fuelCapacity: sql.raw("excluded.fuel_capacity"),
        waterCapacity: sql.raw("excluded.water_capacity"),
        sailType: sql.raw("excluded.sail_type"),
      },
    });

  await db
    .insert(listingMedia)
    .values(
      yachts.flatMap((item) =>
        item.media.map((externalUrl, index) => ({
          id: `lmed_${item.listingId.replace("ylst_yacht-", "").replaceAll("-", "_")}_${index}`,
          listingId: item.listingId,
          externalUrl,
          role: index === 0 ? ("main" as const) : ("gallery" as const),
          sortOrder: index,
        })),
      ),
    )
    .onConflictDoNothing();

  /*
   * Equipment the yacht has, plus the priced crew roles the sidebar's Crew control
   * reads back. Paid extras are NOT here: they live in provider_extra_catalogue,
   * because an extra is something the customer buys rather than something the
   * yacht carries, and the detail page reads the two from different tables.
   */
  await db
    .insert(listingAmenity)
    .values(
      yachts.flatMap((item) =>
        [
          ...item.amenityIds.map((amenityId) => ({
            amenityId,
            priceMinor: null,
            priceCurrency: null,
          })),
          ...crewRoleIdsFor(crewTypeFor(item.categoryId)).map((amenityId) => ({
            amenityId,
            priceMinor: crewRolePrice(amenityId),
            priceCurrency: "EUR",
          })),
        ].map(({ amenityId, priceMinor, priceCurrency }) => ({
          id: `lamn_${item.listingId.replace("ylst_yacht-", "").replaceAll("-", "_")}_${amenityId.replace("amn_", "")}`,
          listingId: item.listingId,
          amenityId,
          obligatory: false,
          priceMinor,
          priceCurrency,
        })),
      ),
    )
    .onConflictDoUpdate({
      target: [listingAmenity.listingId, listingAmenity.amenityId],
      set: {
        obligatory: sql.raw("excluded.obligatory"),
        priceMinor: sql.raw("excluded.price_minor"),
        priceCurrency: sql.raw("excluded.price_currency"),
      },
    });

  await db
    .insert(providerExtraCatalogue)
    .values(
      yachts.flatMap((item) =>
        MOCK_EXTRAS.map((extra) => ({
          id: `pxtr_${item.listingId.replace("ylst_yacht-", "").replaceAll("-", "_")}_${extra.externalId.replaceAll("-", "_")}`,
          listingId: item.listingId,
          source: "mock",
          // The mock keeps one flat code space rather than the separate service and
          // equipment spaces a real vendor has; `equipment` is the arbitrary half of
          // the pair it is filed under.
          kind: "equipment" as const,
          externalId: extra.externalId,
          name: extra.name,
          obligatory: extra.obligatory,
          priceMinor: extra.priceMinor,
          priceCurrency: "EUR",
          onRequestOnly: false,
        })),
      ),
    )
    .onConflictDoUpdate({
      target: [
        providerExtraCatalogue.listingId,
        providerExtraCatalogue.source,
        providerExtraCatalogue.kind,
        providerExtraCatalogue.externalId,
      ],
      set: {
        name: sql.raw("excluded.name"),
        obligatory: sql.raw("excluded.obligatory"),
        priceMinor: sql.raw("excluded.price_minor"),
        priceCurrency: sql.raw("excluded.price_currency"),
      },
    });

  await db
    .insert(listingCheckinRule)
    .values(
      yachts.map((item) => ({
        id: `lcir_${item.listingId.replace("ylst_yacht-", "").replaceAll("-", "_")}_sat`,
        listingId: item.listingId,
        checkinWeekday: 6,
        checkoutWeekday: 6,
        minNights: 7,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(availabilitySlot)
    .values(
      slots.map(({ id, listingId, listingSourceId, startDate, endDate, status, priceMinor }) => ({
        id: `avsl_${id}`,
        listingId,
        listingSourceId,
        startDate,
        endDate,
        status,
        availabilityConfirmed: hasConfirmedAvailability(id, status),
        priceMinor,
        currency: "EUR",
        minNights: 7,
        checkinWeekday: 6,
        checkoutWeekday: 6,
        sourceHash: `mock-${id}`,
      })),
    )
    .onConflictDoUpdate({
      target: [availabilitySlot.listingId, availabilitySlot.startDate, availabilitySlot.endDate],
      set: {
        status: sql.raw("excluded.status"),
        availabilityConfirmed: sql.raw("excluded.availability_confirmed"),
        priceMinor: sql.raw("excluded.price_minor"),
        currency: sql.raw("excluded.currency"),
        minNights: sql.raw("excluded.min_nights"),
        checkinWeekday: sql.raw("excluded.checkin_weekday"),
        checkoutWeekday: sql.raw("excluded.checkout_weekday"),
        sourceHash: sql.raw("excluded.source_hash"),
      },
    });

  await db
    .insert(listingPricePeriod)
    .values(pricePeriods)
    .onConflictDoUpdate({
      target: [
        listingPricePeriod.listingId,
        listingPricePeriod.kind,
        listingPricePeriod.startDate,
        listingPricePeriod.endDate,
      ],
      set: {
        priceMinor: sql.raw("excluded.price_minor"),
        currency: sql.raw("excluded.currency"),
      },
    });

  await db.insert(listingFreePeriod).values(freePeriods).onConflictDoNothing();

  await db
    .insert(review)
    .values(
      yachts.map((item) => ({
        id: `rev_${item.listingId.replace("ylst_yacht-", "").replaceAll("-", "_")}`,
        listingId: item.listingId,
        rating: item.rating,
        author: item.reviewAuthor,
        body: item.reviewBody,
      })),
    )
    .onConflictDoNothing();

  await db
    .insert(faq)
    .values(
      yachts.flatMap((item) => [
        {
          id: `faq_${item.listingId.replace("ylst_yacht-", "").replaceAll("-", "_")}_crew`,
          listingId: item.listingId,
          question: "Can this yacht be booked with a skipper?",
          answer:
            "Yes. The mock provider supports skipper selection as an optional extra at quote time.",
          sortOrder: 1,
        },
        {
          id: `faq_${item.listingId.replace("ylst_yacht-", "").replaceAll("-", "_")}_payment`,
          listingId: item.listingId,
          question: "What payment policy is shown for demo quotes?",
          answer: "Demo quotes use a 50% deposit with the balance due at check-in.",
          sortOrder: 2,
        },
      ]),
    )
    .onConflictDoNothing();

  await rebuildListingSearchDocs(db);

  console.log(
    `Seeded ${yachts.length} mock yacht listings and ${slots.length} availability slots across ${countries.length} countries.`,
  );
}
