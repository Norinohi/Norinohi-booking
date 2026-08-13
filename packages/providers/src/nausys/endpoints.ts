import { z } from "zod";

import { looseJsonObject } from "../shared/json";

/**
 * The only file that names NauSYS paths or payload fields. Everything else in
 * `nausys/` composes these, so a vendor rename is a one-file change.
 *
 * Object schemas are deliberately loose: the vendor changelog adds fields to
 * existing `Rest*` types between minor releases, and a strict schema would turn
 * an additive change into an outage. Fields we actually read are required.
 */

const CATALOGUE = "/CBMS-external/rest/catalogue/v6";
const YACHT_RESERVATION = "/CBMS-external/rest/yachtReservation/v6";
const BOOKING = "/CBMS-external/rest/booking/v6";

export type NausysId = number | string;

export const nausysEndpoints = {
  catalogue: {
    cabins: (companyId: NausysId) => `${CATALOGUE}/cabins/${companyId}`,
    charterBases: `${CATALOGUE}/charterBases`,
    charterCompanies: `${CATALOGUE}/charterCompanies`,
    countries: `${CATALOGUE}/countries`,
    countryStates: `${CATALOGUE}/countrystates`,
    regions: `${CATALOGUE}/regions`,
    locations: `${CATALOGUE}/locations`,
    discountItems: `${CATALOGUE}/discountItems`,
    engineBuilders: `${CATALOGUE}/engineBuilders`,
    equipment: `${CATALOGUE}/equipment`,
    equipmentCategories: `${CATALOGUE}/equipmentCategories`,
    leadSources: `${CATALOGUE}/leadSources`,
    priceLists: `${CATALOGUE}/priceLists`,
    priceMeasures: `${CATALOGUE}/priceMeasures`,
    reservationTags: `${CATALOGUE}/reservationTags`,
    sailTypes: `${CATALOGUE}/sailTypes`,
    seasons: `${CATALOGUE}/seasons`,
    services: `${CATALOGUE}/services`,
    steeringTypes: `${CATALOGUE}/steeringTypes`,
    yachtBuilders: `${CATALOGUE}/yachtBuilders`,
    yachtCategories: `${CATALOGUE}/yachtCategories`,
    yachtModels: `${CATALOGUE}/yachtModels`,
    yachts: (companyId: NausysId) => `${CATALOGUE}/yachts/${companyId}`,
    yacht: (yachtId: NausysId) => `${CATALOGUE}/yacht/${yachtId}`,
  },
  availability: {
    freeYachts: `${YACHT_RESERVATION}/freeYachts`,
    freeYachtsSearch: `${YACHT_RESERVATION}/freeYachtsSearch`,
    freeYachtsSearchCriteria: `${YACHT_RESERVATION}/freeYachtsSearchCriteria`,
    occupancy: (companyId: NausysId, year: NausysId) =>
      `${YACHT_RESERVATION}/occupancy/${companyId}/${year}`,
    occupancy2: (companyId: NausysId, seasonId: NausysId) =>
      `${YACHT_RESERVATION}/occupancy2/${companyId}/${seasonId}`,
    reservations: `${YACHT_RESERVATION}/reservations`,
    options: `${YACHT_RESERVATION}/options`,
    stornos: `${YACHT_RESERVATION}/stornos`,
  },
  booking: {
    createInfo: `${BOOKING}/createInfo`,
    createOption: `${BOOKING}/createOption`,
    createBooking: `${BOOKING}/createBooking`,
    stornoOption: `${BOOKING}/stornoOption`,
    addExtras: `${BOOKING}/addExtras`,
    updateExtras: `${BOOKING}/updateExtras`,
  },
} as const;

/**
 * `onlinePayment` is intentionally absent: Stripe is our processor, and an
 * endpoint that is not named here cannot be called by accident.
 */

// -- status ------------------------------------------------------------------

export const NAUSYS_STATUS_CODES = {
  OK: 0,
  AUTHENTICATION_ERROR: 100,
  OPERATION_NOT_ALLOWED: 101,
  INSUFFICIENT_DATA: 201,
  INVALID_DATE_FORMAT: 202,
  INVALID_NUMBER_FORMAT: 203,
  INVALID_EMAIL_FORMAT: 204,
  CREW_LIST_LOCKED: 301,
  CREW_LIST_VALIDATION_FAILED: 303,
  INVALID_COUNTRY_ID: 401,
  INVALID_YACHT_ID: 402,
  WRONG_YACHT_OWNERSHIP: 403,
  NOT_ALLOWED_TO_BOOK_THIS_YACHT: 404,
  INVALID_PAYMENT_METHOD: 405,
  INVALID_CURRENCY: 406,
  UNKNOWN_ERROR: 999,
} as const;

export type NausysStatusName = keyof typeof NAUSYS_STATUS_CODES;
export type NausysStatusCode = (typeof NAUSYS_STATUS_CODES)[NausysStatusName];

export const NAUSYS_STATUS_NAMES: Record<number, NausysStatusName> = Object.fromEntries(
  Object.entries(NAUSYS_STATUS_CODES).map(([name, code]) => [
    code,
    // SAFETY: NausysStatusName is keyof typeof NAUSYS_STATUS_CODES, so every key
    // Object.entries yields is one by construction; entries only widens it to
    // string because it cannot express that.
    name as NausysStatusName,
  ]),
);

/**
 * Every NauSYS response, including failures, arrives as HTTP 200 with this
 * envelope. `errorCode` is omitted on some successful catalogue dumps.
 */
export const restStatusSchema = looseJsonObject({
  status: z.string(),
  errorCode: z.number().int().optional(),
});
export type RestStatus = z.infer<typeof restStatusSchema>;

// -- primitives --------------------------------------------------------------

/** Money is always a decimal string ("3340.00"); percentages are numbers. */
const decimal = z.string();
const nausysDate = z.string();
const nausysDateTime = z.string();

export const restInternationalTextSchema = looseJsonObject({
  textEN: z.string().optional(),
  textDE: z.string().optional(),
  textHR: z.string().optional(),
  textIT: z.string().optional(),
  textSI: z.string().optional(),
});

export const restCredentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
});
export type RestCredentials = z.infer<typeof restCredentialsSchema>;

// -- catalogue ---------------------------------------------------------------

export const restCountrySchema = looseJsonObject({
  id: z.number().int(),
  code: z.string().optional(),
  code2: z.string().optional(),
  name: restInternationalTextSchema,
});

export const restCountryStateSchema = looseJsonObject({
  id: z.number().int(),
  countryId: z.number().int(),
  // The only catalogue name the vendor does not translate: recorded states carry
  // a bare string ("Alabama") where every sibling resource sends international text.
  name: z.string(),
});

export const restRegionSchema = looseJsonObject({
  id: z.number().int(),
  countryId: z.number().int(),
  name: restInternationalTextSchema,
});

export const restLocationSchema = looseJsonObject({
  id: z.number().int(),
  regionId: z.number().int(),
  name: restInternationalTextSchema,
  lat: z.number().optional(),
  lon: z.number().optional(),
});

export const restCharterCompanySchema = looseJsonObject({
  id: z.number().int(),
  name: z.string(),
  companyName: z.string().optional(),
  countryId: z.number().int().optional(),
  city: z.string().optional(),
  address: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  web: z.string().optional(),
  // Lower-case `c`, unlike every neighbouring camelCase field.
  vatcode: z.string().optional(),
});

export const restCharterBaseSchema = looseJsonObject({
  id: z.number().int(),
  locationId: z.number().int(),
  companyId: z.number().int(),
  disabled: z.boolean().optional(),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
});

export const restEquipmentCategorySchema = looseJsonObject({
  id: z.number().int(),
  name: restInternationalTextSchema,
});

/**
 * `categoryId` stays required although two of the 1095 recorded rows omit it:
 * `amenity.amenity_category_id` is NOT NULL, so those rows have nowhere to go and
 * are better dropped at the parse than carried as an orphan.
 */
export const restEquipmentSchema = looseJsonObject({
  id: z.number().int(),
  categoryId: z.number().int(),
  name: restInternationalTextSchema,
});

export const restYachtBuilderSchema = looseJsonObject({
  id: z.number().int(),
  name: z.string(),
});

export const restYachtCategorySchema = looseJsonObject({
  id: z.number().int(),
  name: restInternationalTextSchema,
});

/**
 * The hull dimensions and the category live here, not on `RestYacht`: the vendor
 * models them as properties of the model, so two sisterships share them.
 */
export const restYachtModelSchema = looseJsonObject({
  id: z.number().int(),
  name: z.string(),
  yachtBuilderId: z.number().int().optional(),
  yachtCategoryId: z.number().int().optional(),
  loa: z.number().optional(),
  beam: z.number().optional(),
  draft: z.number().optional(),
  displacement: z.number().optional(),
  /** Marketing length in feet; `loa` is the metric one we publish. */
  virtualLength: z.number().optional(),
  cabins: z.number().int().optional(),
  wc: z.number().int().optional(),
  fuelTank: z.number().optional(),
  waterTank: z.number().optional(),
});

export const restServiceSchema = looseJsonObject({
  id: z.number().int(),
  name: restInternationalTextSchema,
  depositInsurance: z.boolean().optional(),
});

/**
 * Seven named booleans per direction, not a numeric day. A period may enable
 * several weekdays at once, and the whole rule is bounded by `dateFrom`/`dateTo`.
 * `minimumShortPeriodDuration` is the floor for short-break offers, which is a
 * different product from `minimalReservationDuration`.
 */
export const restCheckInPeriodSchema = looseJsonObject({
  dateFrom: nausysDate.optional(),
  dateTo: nausysDate.optional(),
  checkInMonday: z.boolean().optional(),
  checkInTuesday: z.boolean().optional(),
  checkInWednesday: z.boolean().optional(),
  checkInThursday: z.boolean().optional(),
  checkInFriday: z.boolean().optional(),
  checkInSaturday: z.boolean().optional(),
  checkInSunday: z.boolean().optional(),
  checkOutMonday: z.boolean().optional(),
  checkOutTuesday: z.boolean().optional(),
  checkOutWednesday: z.boolean().optional(),
  checkOutThursday: z.boolean().optional(),
  checkOutFriday: z.boolean().optional(),
  checkOutSaturday: z.boolean().optional(),
  checkOutSunday: z.boolean().optional(),
  minimalReservationDuration: z.number().int().optional(),
  minimumShortPeriodDuration: z.number().int().optional(),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
});

export const restYachtPictureSchema = looseJsonObject({
  src: z.string(),
  description: restInternationalTextSchema.optional(),
  isGenuine: z.boolean().optional(),
  lastModified: nausysDateTime.optional(),
  mainPicture: z.boolean().optional(),
  layoutPicture: z.boolean().optional(),
  catalogPhoto: z.boolean().optional(),
});

/**
 * Prices, services, extras and discounts, per season and per base. Only the
 * currency has a canonical home today; the rest is read from the retained raw
 * payload by the availability and quote paths.
 */
export const restSeasonSpecificDataSchema = looseJsonObject({
  seasonId: z.number().int().optional(),
  baseId: z.number().int().optional(),
  locationId: z.number().int().optional(),
  agencyVisible: z.boolean().optional(),
  prices: z
    .array(
      looseJsonObject({
        dateFrom: nausysDate.optional(),
        dateTo: nausysDate.optional(),
        price: z.union([decimal, z.number()]).optional(),
        currency: z.string().optional(),
        type: z.string().optional(),
      }),
    )
    .optional(),
});

/**
 * Money on `RestYacht` is a bare number ("deposit": 1825), unlike the decimal
 * strings every price-bearing endpoint sends. Both shapes are accepted so a
 * vendor that aligns them later does not drop the yacht.
 */
const yachtAmount = z.union([decimal, z.number()]);

/**
 * Aggregate scores from Euminia, the vendor's third-party review platform. Absent
 * entirely when the yacht has never been rated, and every value is a string: our
 * account sends "4,00" where the vendor PDF prints "4.83", and `recommendation`
 * is a percentage with a space ("100 %"). Loose and all-optional because the
 * vendor keeps adding sub-scores and only `total`/`reviews` have a home today.
 */
const euminiaSchema = looseJsonObject({
  total: z.string().optional(),
  reviews: z.string().optional(),
  recommendation: z.string().optional(),
  cleanliness: z.string().optional(),
  equipment: z.string().optional(),
  personalService: z.string().optional(),
  pricePerformance: z.string().optional(),
});

export const restYachtSchema = looseJsonObject({
  id: z.number().int(),
  name: z.string(),
  companyId: z.number().int(),
  baseId: z.number().int().optional(),
  locationId: z.number().int().optional(),
  yachtModelId: z.number().int().optional(),
  cabins: z.number().int().optional(),
  cabinsCrew: z.number().int().optional(),
  wc: z.number().int().optional(),
  wcCrew: z.number().int().optional(),
  showers: z.number().int().optional(),
  berthsTotal: z.number().int().optional(),
  berthsCabin: z.number().int().optional(),
  berthsSalon: z.number().int().optional(),
  berthsCrew: z.number().int().optional(),
  maxPersons: z.number().int().optional(),
  buildYear: z.number().int().optional(),
  launchedYear: z.number().int().optional(),
  renewed: z.number().int().optional(),
  draft: z.number().optional(),
  engines: z.number().int().optional(),
  enginePower: z.number().optional(),
  engineBuilderId: z.number().int().optional(),
  fuelTank: z.number().optional(),
  waterTank: z.number().optional(),
  maxSpeed: z.number().optional(),
  /** Vendor spelling of "cruising speed". */
  crusingSpeed: z.number().optional(),
  numberOfRudderBlades: z.number().int().optional(),
  sailTypeId: z.number().int().optional(),
  steeringTypeId: z.number().int().optional(),
  /** Vendor typo, sent alongside `steeringTypeId` with the same value. */
  stearingTypeId: z.number().int().optional(),
  deposit: yachtAmount.optional(),
  depositWhenInsured: yachtAmount.optional(),
  depositCurrency: z.string().optional(),
  charterType: z.string().optional(),
  crewedCharterType: z.string().optional(),
  /** Both keep a yacht out of the published catalogue; see `projection.ts`. */
  disabled: z.boolean().optional(),
  internalUse: z.boolean().optional(),
  onSale: z.boolean().optional(),
  isPremium: z.boolean().optional(),
  needsOptionApproval: z.boolean().optional(),
  canMakeBookingFixed: z.boolean().optional(),
  highlights: z.string().optional(),
  highlightsIntText: restInternationalTextSchema.optional(),
  note: z.string().optional(),
  noteIntText: restInternationalTextSchema.optional(),
  mainPictureUrl: z.string().optional(),
  /** Trailing capital L is the vendor's; there is no `pictureURLs`. */
  picturesURL: z.array(z.string()).optional(),
  pictures: z.array(restYachtPictureSchema).optional(),
  standardYachtEquipment: z
    .array(
      looseJsonObject({
        id: z.number().int().optional(),
        equipmentId: z.number().int(),
        quantity: z.number().optional(),
        highlight: z.boolean().optional(),
        comment: restInternationalTextSchema.optional(),
      }),
    )
    .optional(),
  /**
   * Populated for one yacht in 109 and in a different id space from
   * `standardYachtEquipment`; amenities are read from the latter.
   */
  yachtAmenities: z.array(looseJsonObject({ amenityId: z.number().int() })).optional(),
  yachtCabinDetails: z.array(looseJsonObject({ id: z.number().int().optional() })).optional(),
  checkInPeriods: z.array(restCheckInPeriodSchema).optional(),
  oneWayPeriods: z
    .array(
      looseJsonObject({
        id: z.number().int().optional(),
        baseId: z.number().int().optional(),
        locationId: z.number().int().optional(),
        periodFrom: nausysDate.optional(),
        periodTo: nausysDate.optional(),
      }),
    )
    .optional(),
  seasonSpecificData: z.array(restSeasonSpecificDataSchema).optional(),
  // Caught rather than required: a vendor that switches these to numbers should
  // cost us the ratings, not the whole yacht, which is what a parse failure here
  // would do (see `parseAll` in projection.ts).
  euminia: euminiaSchema.optional().catch(undefined),
});

/**
 * Collection keys are the ones recorded against production, not the ones the
 * vendor PDF prints: `countrystates` answers under `countries` and `discountItems`
 * under `discounts`. Each list is optional so an empty dump parses.
 */
const statusFields = {
  status: z.string(),
  errorCode: z.number().int().optional(),
};

export const restCountriesResponseSchema = looseJsonObject({
  ...statusFields,
  countries: z.array(restCountrySchema).optional(),
});

export const restCountryStatesResponseSchema = looseJsonObject({
  ...statusFields,
  countries: z.array(restCountryStateSchema).optional(),
});

export const restRegionsResponseSchema = looseJsonObject({
  ...statusFields,
  regions: z.array(restRegionSchema).optional(),
});

export const restLocationsResponseSchema = looseJsonObject({
  ...statusFields,
  locations: z.array(restLocationSchema).optional(),
});

export const restCharterCompaniesResponseSchema = looseJsonObject({
  ...statusFields,
  companies: z.array(restCharterCompanySchema).optional(),
});

export const restCharterBasesResponseSchema = looseJsonObject({
  ...statusFields,
  bases: z.array(restCharterBaseSchema).optional(),
});

export const restEquipmentResponseSchema = looseJsonObject({
  ...statusFields,
  equipment: z.array(restEquipmentSchema).optional(),
});

export const restEquipmentCategoriesResponseSchema = looseJsonObject({
  ...statusFields,
  equipmentCategories: z.array(restEquipmentCategorySchema).optional(),
});

export const restYachtBuildersResponseSchema = looseJsonObject({
  ...statusFields,
  builders: z.array(restYachtBuilderSchema).optional(),
});

export const restYachtCategoriesResponseSchema = looseJsonObject({
  ...statusFields,
  categories: z.array(restYachtCategorySchema).optional(),
});

export const restYachtModelsResponseSchema = looseJsonObject({
  ...statusFields,
  models: z.array(restYachtModelSchema).optional(),
});

export const restServicesResponseSchema = looseJsonObject({
  ...statusFields,
  services: z.array(restServiceSchema).optional(),
});

export const restYachtsResponseSchema = looseJsonObject({
  ...statusFields,
  /** Bare ids, sent before `yachts` and easy to mistake for the collection. */
  yachtIDs: z.array(z.number().int()).optional(),
  yachts: z.array(restYachtSchema).optional(),
});

// -- availability ------------------------------------------------------------

export const restDiscountSchema = looseJsonObject({
  discountItemId: z.number().int(),
  // `type: "PERCENTAGE"` sends a number, `"AMOUNT"` a decimal string. Vendor
  // question: whether both shapes really occur on the same field.
  amount: z.union([decimal, z.number()]),
  type: z.string(),
});

export const restPriceSchema = looseJsonObject({
  priceListPrice: decimal,
  clientPrice: decimal,
  currency: z.string(),
  discounts: z.array(restDiscountSchema).optional(),
  /** Security deposit for the period, authoritative over the catalogue value. */
  depositAmount: decimal.optional(),
  depositWhenInsuredAmount: decimal.optional(),
  /** "I" included, "E" excluded. Varies per price list; see Q-PRICELIST-VAT. */
  vatInPrice: z.string().optional(),
  /**
   * What we earn, not what the customer pays. Typed so it is named and therefore
   * greppable, and must never reach a quote line or any oRPC response.
   */
  agencyCommission: decimal.optional(),
});

export const restPaymentPlanSchema = looseJsonObject({
  date: nausysDate,
  percentage: z.number(),
});

/**
 * An extra on a `freeYachts` offer, as production actually sends it.
 *
 * Two shapes share this schema. An obligatory extra is keyed by `serviceId`; an
 * additional one is keyed by `extraId` plus `extrasType`, and carries no
 * `serviceId` at all, so neither id can be required.
 *
 * `amount` is the UNIT price and `totalPrice` is the line total: a recorded extra
 * has `amount: "10.00"`, `quantity: "10.00"`, `totalPrice: "100.00"`. Anything
 * billing off `amount` under-charges by the quantity, which is why `totalPrice`
 * is what the quote mapper reads.
 *
 * `quantity` is a decimal string, not a number, and `condition` is international
 * text rather than a string (frequently `{}`).
 */
export const restExtraSchema = looseJsonObject({
  /** Present on obligatory extras. */
  serviceId: z.number().int().optional(),
  /** Present on additional extras, alongside `extrasType`. */
  extraId: z.number().int().optional(),
  extrasType: z.string().optional(),
  amount: decimal,
  totalPrice: decimal.optional(),
  listPrice: decimal.optional(),
  currency: z.string(),
  quantity: decimal.optional(),
  priceMeasureId: z.number().int().optional(),
  calculationType: z.string().optional(),
  condition: restInternationalTextSchema.optional(),
  obligatory: z.boolean().optional(),
});

export const restFreeYachtStatusSchema = z.enum(["FREE", "UNDER_OPTION"]);

export const restFreeYachtSchema = looseJsonObject({
  yachtId: z.number().int(),
  periodFrom: nausysDate,
  periodTo: nausysDate,
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  locationFromId: z.number().int().optional(),
  locationToId: z.number().int().optional(),
  price: restPriceSchema,
  paymentPlans: z.array(restPaymentPlanSchema).optional(),
  obligatoryExtras: z.array(restExtraSchema).optional(),
  additionalExtras: z.array(restExtraSchema).optional(),
  // Branched on, so a new vendor literal must fail here rather than be silently
  // treated as bookable.
  status: restFreeYachtStatusSchema,
  optionValidTill: nausysDateTime.optional(),
  totalPriceWithExtras: decimal.optional(),
});

export const restFreeYachtsRequestSchema = z.object({
  credentials: restCredentialsSchema,
  periodFrom: nausysDate,
  periodTo: nausysDate,
  yachts: z.array(z.number().int()),
  currency: z.string().optional(),
  extendedDataSet: z.string().optional(),
  ignoreOptions: z.boolean().optional(),
});
export type RestFreeYachtsRequest = z.infer<typeof restFreeYachtsRequestSchema>;

export const restFreeYachtsResponseSchema = looseJsonObject({
  status: z.string(),
  errorCode: z.number().int().optional(),
  freeYachts: z.array(restFreeYachtSchema).optional(),
});

export const restFreeYachtsSearchRequestSchema = z.object({
  credentials: restCredentialsSchema,
  periodFrom: nausysDate,
  periodTo: nausysDate,
  countries: z.array(z.number().int()).optional(),
  regions: z.array(z.number().int()).optional(),
  locations: z.array(z.number().int()).optional(),
  charterCompanies: z.array(z.number().int()).optional(),
  yachtCategories: z.array(z.number().int()).optional(),
  yachtModels: z.array(z.number().int()).optional(),
  yachtBuilders: z.array(z.number().int()).optional(),
  equipments: z.array(z.number().int()).optional(),
  sailType: z.number().int().optional(),
  cabins: z.array(z.number().int()).optional(),
  wc: z.array(z.number().int()).optional(),
  lengthFrom: z.number().optional(),
  lengthTo: z.number().optional(),
  persons: z.array(z.number().int()).optional(),
  buildYearFrom: z.number().int().optional(),
  buildYearTo: z.number().int().optional(),
  rentType: z.string().optional(),
  boatType: z.enum(["BAREBOAT", "CREWED"]).optional(),
  bookingTypes: z.array(z.string()).optional(),
  currency: z.string().optional(),
  /** 1 base, 2 price, 3 length, 4 cabins, 5 build year. */
  orderby: z.number().int().optional(),
  desc: z.union([z.literal(0), z.literal(1)]).optional(),
  resultsPerPage: z.number().int().optional(),
  resultsPage: z.number().int().optional(),
  ignoreOptions: z.boolean().optional(),
  extendedDataSet: z.string().optional(),
  specialSearchType: z.enum(["REGULAR_OFFERS", "SHORT_OFFERS", "ONE_WAY_OFFERS"]).optional(),
  specialSearchRangeFrom: nausysDate.optional(),
  specialSearchRangeTo: nausysDate.optional(),
});
export type RestFreeYachtsSearchRequest = z.infer<typeof restFreeYachtsSearchRequestSchema>;

export const restFreeYachtsSearchResponseSchema = looseJsonObject({
  status: z.string(),
  errorCode: z.number().int().optional(),
  from: nausysDate.optional(),
  to: nausysDate.optional(),
  totalCount: z.number().int().optional(),
  // Page-number pagination, the only resumable handle the vendor offers.
  totalPages: z.number().int().optional(),
  currentPage: z.number().int().optional(),
  resultsPerPage: z.number().int().optional(),
  startIdx: z.number().int().optional(),
  endIdx: z.number().int().optional(),
  freeYachtsInPeriod: z.array(restFreeYachtSchema).optional(),
});

// SERVICE is undocumented but real: maintenance and out-of-fleet blocks, carrying
// negative ids and open-ended periods (01.01.2020 to 31.12.2099 in production).
export const restOccupancyReservationTypeSchema = z.enum(["RESERVATION", "OPTION", "SERVICE"]);

export const restOccupancyReservationSchema = looseJsonObject({
  id: z.number().int(),
  yachtId: z.number().int(),
  locationFromId: z.number().int().optional(),
  locationToId: z.number().int().optional(),
  reservationType: restOccupancyReservationTypeSchema,
  periodFrom: nausysDate,
  periodTo: nausysDate,
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
  optionValidTill: nausysDateTime.optional(),
});

export const restOccupancyResponseSchema = looseJsonObject({
  status: z.string(),
  errorCode: z.number().int().optional(),
  companyId: z.number().int().optional(),
  year: z.number().int().optional(),
  seasonId: z.number().int().optional(),
  reservations: z.array(restOccupancyReservationSchema).optional(),
});

// -- booking -----------------------------------------------------------------

/**
 * A client field the vendor may answer with `false` instead of omitting it or sending an
 * empty string — observed on `company` for a private booking, and the same shape is
 * plausible on every other text field of this block. Read `false` as absent; `true` is
 * not tolerated, because a boolean-shaped *value* would be new information, not a blank.
 */
const blankableString = z
  .union([z.string(), z.literal(false)])
  .transform((value) => (value === false ? undefined : value))
  .optional();

export const restClientSchema = looseJsonObject({
  name: blankableString,
  surname: blankableString,
  company: blankableString,
  vatNr: blankableString,
  address: blankableString,
  zip: blankableString,
  city: blankableString,
  countryId: z.number().int().optional(),
  email: blankableString,
  phone: blankableString,
  mobile: blankableString,
});
export type RestClient = z.infer<typeof restClientSchema>;

export const restReservationStatusSchema = z.enum(["INFO", "OPTION", "RESERVATION", "STORNO"]);

/**
 * `uuid` is a per-reservation security token that the vendor rotates whenever
 * important reservation data changes, so it is required on every response: a
 * call made with a stale uuid fails, and the failure only surfaces later.
 */
export const restYachtReservationSchema = looseJsonObject({
  id: z.number().int(),
  uuid: z.string(),
  reservationStatus: restReservationStatusSchema,
  yachtId: z.number().int(),
  periodFrom: nausysDate,
  periodTo: nausysDate,
  optionTill: nausysDateTime.optional(),
  agency: z.string().optional(),
  client: restClientSchema.optional(),
  discounts: z.array(restDiscountSchema).optional(),
  additionalEquipment: z.array(restExtraSchema).optional(),
  services: z.array(restExtraSchema).optional(),
  priceListPrice: decimal.optional(),
  // Our cost, never a customer-facing number. Retained in raw, never mapped to
  // a canonical DTO.
  agencyPrice: decimal.optional(),
  clientPrice: decimal.optional(),
  currency: z.string().optional(),
  paymentCurrency: z.string().optional(),
  securityDeposit: decimal.optional(),
  approved: z.boolean().optional(),
  numberOfPayments: z.number().int().optional(),
  useDepositPayment: z.boolean().optional(),
});
export type RestYachtReservation = z.infer<typeof restYachtReservationSchema>;

/**
 * The booking endpoints answer with the reservation itself, carrying the status
 * envelope on the same object rather than nesting it. Failures never reach here:
 * the client classifies a non-OK status before anything is parsed.
 */
export const restYachtReservationResponseSchema = restYachtReservationSchema.extend(statusFields);

export const restCreateInfoRequestSchema = z.object({
  credentials: restCredentialsSchema,
  client: restClientSchema,
  periodFrom: nausysDate,
  periodTo: nausysDate,
  // Vendor spells this field with a capital D, unlike every neighbouring field.
  yachtID: z.number().int(),
});
export type RestCreateInfoRequest = z.infer<typeof restCreateInfoRequestSchema>;

export const restCreateOptionRequestSchema = z.object({
  credentials: restCredentialsSchema,
  id: z.number().int(),
  uuid: z.string(),
  /*
   * A stringified boolean, and only that: the vendor deserializes this field as a String, so a
   * JSON `false` kills the request inside their JSON-B parser and comes back as an HTML 500
   * before any handler sees it. Typed here so the shape cannot regress to a boolean.
   */
  createWaitingOption: z.enum(["true", "false"]).optional(),
});
export type RestCreateOptionRequest = z.infer<typeof restCreateOptionRequestSchema>;

export const restReservationRefRequestSchema = z.object({
  credentials: restCredentialsSchema,
  id: z.number().int(),
  uuid: z.string(),
});
export type RestReservationRefRequest = z.infer<typeof restReservationRefRequestSchema>;
