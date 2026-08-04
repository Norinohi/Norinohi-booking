import { db } from "./index";
import {
  amenity,
  amenityCategory,
  availabilitySlot,
  base,
  builder,
  country,
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
  { id: "rgn_campania", countryId: "cty_it", name: "Campania" },
  { id: "rgn_balearics", countryId: "cty_es", name: "Balearic Islands" },
  { id: "rgn_phuket", countryId: "cty_th", name: "Phuket" },
];

const locations = [
  { id: "loc_split", regionId: "rgn_dalmatia", name: "Split" },
  { id: "loc_dubrovnik", regionId: "rgn_dalmatia", name: "Dubrovnik" },
  { id: "loc_athens", regionId: "rgn_attica", name: "Athens" },
  { id: "loc_mykonos", regionId: "rgn_cyclades", name: "Mykonos" },
  { id: "loc_amalfi", regionId: "rgn_campania", name: "Amalfi Coast" },
  { id: "loc_palma", regionId: "rgn_balearics", name: "Palma de Mallorca" },
  { id: "loc_phuket", regionId: "rgn_phuket", name: "Ao Po" },
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
];

const models = [
  { id: "mdl_lagoon_42", builderId: "bld_lagoon", name: "Lagoon 42" },
  { id: "mdl_bavaria_c45", builderId: "bld_bavaria", name: "C45" },
  { id: "mdl_sunreef_60", builderId: "bld_sunreef", name: "Sunreef 60" },
  {
    id: "mdl_oceanis_461",
    builderId: "bld_beneteau",
    name: "Oceanis 46.1",
  },
  { id: "mdl_lagoon_52f", builderId: "bld_lagoon", name: "Lagoon 52 F" },
  { id: "mdl_bavaria_c38", builderId: "bld_bavaria", name: "C38" },
  { id: "mdl_dufour_470", builderId: "bld_dufour", name: "470" },
  {
    id: "mdl_elba_45",
    builderId: "bld_fountaine_pajot",
    name: "Elba 45",
  },
  {
    id: "mdl_sun_odyssey_410",
    builderId: "bld_jeanneau",
    name: "Sun Odyssey 410",
  },
  { id: "mdl_prestige_520", builderId: "bld_prestige", name: "520" },
];

const categories = [
  { id: "cat_catamaran", code: "catamaran", name: "Catamaran" },
  { id: "cat_sailing", code: "sailing-yacht", name: "Sailing yacht" },
  { id: "cat_motor", code: "motor-yacht", name: "Motor yacht" },
  { id: "cat_luxury", code: "luxury-yacht", name: "Luxury yacht" },
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
];

const yachts = [
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

const slots = [
  [
    "lagoon_42_2026_08_08",
    "ylst_yacht-lagoon-42-aurora",
    "lsrc_lagoon_42_aurora",
    "2026-08-08",
    "2026-08-15",
    "available",
    540000,
  ],
  [
    "lagoon_42_2026_08_15",
    "ylst_yacht-lagoon-42-aurora",
    "lsrc_lagoon_42_aurora",
    "2026-08-15",
    "2026-08-22",
    "option",
    565000,
  ],
  [
    "bavaria_c45_2026_08_08",
    "ylst_yacht-bavaria-c45-luna",
    "lsrc_bavaria_c45_luna",
    "2026-08-08",
    "2026-08-15",
    "available",
    390000,
  ],
  [
    "sunreef_60_2026_08_08",
    "ylst_yacht-sunreef-60-celeste",
    "lsrc_sunreef_60_celeste",
    "2026-08-08",
    "2026-08-15",
    "available",
    2140000,
  ],
  [
    "oceanis_461_2026_08_08",
    "ylst_yacht-oceanis-461-maribel",
    "lsrc_oceanis_461_maribel",
    "2026-08-08",
    "2026-08-15",
    "available",
    495000,
  ],
  [
    "lagoon_52f_2026_08_08",
    "ylst_yacht-lagoon-52f-solenne",
    "lsrc_lagoon_52f_solenne",
    "2026-08-08",
    "2026-08-15",
    "occupied",
    1740000,
  ],
  [
    "lagoon_52f_2026_08_22",
    "ylst_yacht-lagoon-52f-solenne",
    "lsrc_lagoon_52f_solenne",
    "2026-08-22",
    "2026-08-29",
    "available",
    1660000,
  ],
  [
    "bavaria_c38_2026_08_08",
    "ylst_yacht-bavaria-c38-niki",
    "lsrc_bavaria_c38_niki",
    "2026-08-08",
    "2026-08-15",
    "available",
    780000,
  ],
  [
    "dufour_470_2026_08_08",
    "ylst_yacht-dufour-470-brisa",
    "lsrc_dufour_470_brisa",
    "2026-08-08",
    "2026-08-15",
    "available",
    690000,
  ],
  [
    "elba_45_2026_08_08",
    "ylst_yacht-elba-45-sabai",
    "lsrc_elba_45_sabai",
    "2026-08-08",
    "2026-08-15",
    "available",
    570000,
  ],
  [
    "sun_odyssey_410_2026_08_08",
    "ylst_yacht-sun-odyssey-410-maestral",
    "lsrc_sun_odyssey_410_maestral",
    "2026-08-08",
    "2026-08-15",
    "available",
    390000,
  ],
  [
    "prestige_520_2026_08_08",
    "ylst_yacht-prestige-520-velvet",
    "lsrc_prestige_520_velvet",
    "2026-08-08",
    "2026-08-15",
    "available",
    1260000,
  ],
  [
    "prestige_520_2026_08_15",
    "ylst_yacht-prestige-520-velvet",
    "lsrc_prestige_520_velvet",
    "2026-08-15",
    "2026-08-22",
    "blocked",
    1320000,
  ],
] as const;

const insertStaticData = async () => {
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
      bases.map(({ id, locationId, name, lat, lng, checkInTime, checkOutTime }) => ({
        id,
        locationId,
        name,
        lat,
        lng,
        checkInTime,
        checkOutTime,
      })),
    )
    .onConflictDoNothing();
  await db.insert(builder).values(builders).onConflictDoNothing();
  await db.insert(yachtModel).values(models).onConflictDoNothing();
  await db.insert(yachtCategory).values(categories).onConflictDoNothing();
  await db.insert(amenityCategory).values(amenityCategories).onConflictDoNothing();
  await db.insert(amenity).values(amenities).onConflictDoNothing();
};

async function main() {
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
        defaultCurrency: "EUR",
        status: "published" as const,
        primarySourceId: item.sourceId,
        freshnessAt: new Date(),
      })),
    )
    .onConflictDoNothing();

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
        yearBuilt: item.yearBuilt,
        cabins: item.cabins,
        berths: item.berths,
        heads: item.heads,
      })),
    )
    .onConflictDoNothing();

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

  await db
    .insert(listingAmenity)
    .values(
      yachts.flatMap((item) =>
        item.amenityIds.map((amenityId) => ({
          id: `lamn_${item.listingId.replace("ylst_yacht-", "").replaceAll("-", "_")}_${amenityId.replace("amn_", "")}`,
          listingId: item.listingId,
          amenityId,
        })),
      ),
    )
    .onConflictDoNothing();

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
      slots.map(([id, listingId, listingSourceId, startDate, endDate, status, priceMinor]) => ({
        id: `avsl_${id}`,
        listingId,
        listingSourceId,
        startDate,
        endDate,
        status,
        priceMinor,
        currency: "EUR",
        minNights: 7,
        checkinWeekday: 6,
        checkoutWeekday: 6,
        sourceHash: `mock-${id}`,
      })),
    )
    .onConflictDoNothing();

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

  console.log(`Seeded ${yachts.length} mock yacht listings across ${countries.length} countries.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
