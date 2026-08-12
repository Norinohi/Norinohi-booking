import { z } from "zod";

/**
 * The only file that knows Booking Manager path and field names. Every schema is
 * deliberately loose (unknown keys pass through, most fields optional) so an
 * additive vendor change cannot fail a whole catalogue sync - the same posture as
 * `nausys/endpoints.ts`.
 *
 * Contract: SwaggerHub `mmksystems/bm-api` v2.1.4.
 */

export const bookingManagerEndpoints = {
  countries: "countries",
  country: (id: number | string) => `country/${id}`,
  worldRegions: "worldRegions",
  worldRegion: (id: number | string) => `worldRegion/${id}`,
  sailingAreas: "sailingAreas",
  sailingArea: (id: number | string) => `sailingArea/${id}`,
  bases: "bases",
  base: (id: number | string) => `base/${id}`,
  equipment: "equipment",
  companies: "companies",
  company: (id: number | string) => `company/${id}`,
  shipyards: "shipyards",
  shipyard: (id: number | string) => `shipyard/${id}`,
  yachts: "yachts",
  yacht: (id: number | string) => `yacht/${id}`,
  yachtTypes: "yachtTypes",
  offers: "offers",
  specialOffers: "specialOffers",
  specialOffersOfType: (offerType: string) => `specialOffers/${offerType}`,
  prices: "prices",
  reservation: "reservation",
  reservationById: (id: number | string) => `reservation/${id}`,
  reservationsByYear: (year: number) => `reservations/${year}`,
  availability: (year: number) => `availability/${year}`,
  shortAvailability: (year: number) => `shortAvailability/${year}`,
} as const;

/**
 * Documented reservation states. `4` (Service) is the vendor's own maintenance
 * or delivery block rather than a sale - the NauSYS import hit the same concept
 * as an undocumented `SERVICE` type and had to treat it as blocked inventory, so
 * it is named here rather than left as a bare number.
 */
export const BM_RESERVATION_STATUS = {
  RESERVATION: 1,
  OPTION: 2,
  OPTION_IN_EXPIRATION: 3,
  SERVICE: 4,
} as const;

export const BM_RESERVATION_STATUS_NAMES: Record<number, string> = {
  [BM_RESERVATION_STATUS.RESERVATION]: "RESERVATION",
  [BM_RESERVATION_STATUS.OPTION]: "OPTION",
  [BM_RESERVATION_STATUS.OPTION_IN_EXPIRATION]: "OPTION_IN_EXPIRATION",
  [BM_RESERVATION_STATUS.SERVICE]: "SERVICE",
};

/** `format=3` on /shortAvailability: one character per day. */
export const BM_SHORT_AVAILABILITY_FORMAT = { BINARY: 1, HEX: 2, STATUS: 3 } as const;

// Numbers arrive as JSON numbers per the spec, but vendors routinely ship them
// as strings; coercing here rather than in the projection keeps the mapper pure.
const numeric = z.coerce.number();
const optionalNumeric = numeric.optional().nullable();
const optionalText = z.string().optional().nullable();

export const restImageSchema = z.looseObject({
  name: optionalText,
  description: optionalText,
  url: optionalText,
  sortOrder: optionalNumeric,
});

export const restDocumentSchema = z.looseObject({
  id: optionalNumeric,
  name: optionalText,
  description: optionalText,
  url: optionalText,
  sortOrder: optionalNumeric,
});

export const restValidForBasesSchema = z.looseObject({
  from: z.array(numeric).optional().nullable(),
  to: z.array(numeric).optional().nullable(),
});

export const restExtrasSchema = z.looseObject({
  id: optionalNumeric,
  name: optionalText,
  obligatory: z.boolean().optional().nullable(),
  price: optionalNumeric,
  currency: optionalText,
  unit: optionalText,
  payableInBase: z.boolean().optional().nullable(),
  includedDepositWaiver: z.boolean().optional().nullable(),
  validDaysFrom: optionalNumeric,
  validDaysTo: optionalNumeric,
  validForBases: z.array(restValidForBasesSchema).optional().nullable(),
  validDateFrom: optionalText,
  validDateTo: optionalText,
  description: optionalText,
  availableInBase: optionalNumeric,
  validSailingAreas: z.array(numeric).optional().nullable(),
});

export const restProductSchema = z.looseObject({
  name: optionalText,
  crewedByDefault: z.boolean().optional().nullable(),
  isDefaultProduct: z.boolean().optional().nullable(),
  extras: z.array(restExtrasSchema).optional().nullable(),
});

export const restDescriptionSchema = z.looseObject({
  category: optionalText,
  text: optionalText,
  document: z.array(restDocumentSchema).optional().nullable(),
});

export const restCrewSchema = z.looseObject({
  name: optionalText,
  description: optionalText,
  age: optionalNumeric,
  nationality: optionalText,
  roles: z.array(z.string()).optional().nullable(),
  licenses: optionalText,
  languages: z.array(z.string()).optional().nullable(),
  images: z.array(restDocumentSchema).optional().nullable(),
});

export const restEquipmentItemRawSchema = z.looseObject({
  id: optionalNumeric,
  parentId: optionalNumeric,
  name: optionalText,
  value: optionalText,
  categoryName: optionalText,
});

/**
 * Note length/beam/cabins/berths sit on the YACHT here. NauSYS hangs them off
 * the model instead, which is exactly the mismatch that made the first NauSYS
 * import drop every listing - do not assume the two providers agree on where a
 * spec lives.
 */
export const restYachtSchema = z.looseObject({
  id: numeric,
  name: optionalText,
  model: optionalText,
  modelId: optionalNumeric,
  kind: optionalText,
  homeBaseId: optionalNumeric,
  homeBase: optionalText,
  companyId: optionalNumeric,
  company: optionalText,
  shipyardId: optionalNumeric,
  year: optionalNumeric,
  certificate: optionalText,
  draught: optionalNumeric,
  beam: optionalNumeric,
  length: optionalNumeric,
  waterCapacity: optionalNumeric,
  fuelCapacity: optionalNumeric,
  engine: optionalText,
  deposit: optionalNumeric,
  currency: optionalText,
  commissionPercentage: optionalNumeric,
  wc: optionalNumeric,
  berths: optionalNumeric,
  cabins: optionalNumeric,
  wcNote: optionalText,
  berthsNote: optionalText,
  cabinsNote: optionalText,
  transitLog: optionalNumeric,
  mainsailArea: optionalNumeric,
  genoaArea: optionalNumeric,
  mainsailType: optionalText,
  genoaType: optionalText,
  requiredSkipperLicense: optionalNumeric,
  defaultCheckInDay: optionalNumeric,
  defaultCheckInTime: optionalText,
  defaultCheckOutTime: optionalText,
  minimumCharterDuration: optionalNumeric,
  maxPeopleOnBoard: optionalNumeric,
  images: z.array(restImageSchema).optional().nullable(),
  equipmentIds: z.array(numeric).optional().nullable(),
  equipment: z
    .array(z.looseObject({ id: optionalNumeric, value: optionalText }))
    .optional()
    .nullable(),
  equipmentRaw: z.array(restEquipmentItemRawSchema).optional().nullable(),
  products: z.array(restProductSchema).optional().nullable(),
  descriptions: z.array(restDescriptionSchema).optional().nullable(),
  crew: z.array(restCrewSchema).optional().nullable(),
});

export const restBaseSchema = z.looseObject({
  id: numeric,
  name: optionalText,
  city: optionalText,
  country: optionalText,
  address: optionalText,
  // Latitude/longitude are declared as strings in the spec, not numbers.
  latitude: optionalText,
  longitude: optionalText,
  countryId: optionalNumeric,
  sailingAreas: z.array(numeric).optional().nullable(),
});

export const restCompanySchema = z.looseObject({
  id: numeric,
  name: optionalText,
  city: optionalText,
  zip: optionalText,
  country: optionalText,
  address: optionalText,
  telephone: optionalText,
  telephone2: optionalText,
  mobile: optionalText,
  vatCode: optionalText,
  email: optionalText,
  web: optionalText,
  bankAccountNumber: optionalText,
  termsAndConditions: optionalText,
  checkoutNote: optionalText,
  maxDiscountFromCommissionPercentage: optionalNumeric,
});

export const restShipyardSchema = z.looseObject({
  id: numeric,
  name: optionalText,
  shortName: optionalText,
});

export const restCountrySchema = z.looseObject({
  id: numeric,
  name: optionalText,
  short: optionalText,
  long: optionalText,
  worldRegion: optionalNumeric,
});

export const restWorldRegionSchema = z.looseObject({ id: numeric, name: optionalText });

export const restSailingAreaSchema = z.looseObject({ id: numeric, name: optionalText });

export const restEquipmentSchema = z.looseObject({ id: numeric, name: optionalText });

export const restYachtTypeSchema = z.looseObject({ name: z.string() });

export const restPaymentSchema = z.looseObject({
  date: optionalText,
  amount: optionalNumeric,
});

export const restOfferSchema = z.looseObject({
  yachtId: numeric,
  yacht: optionalText,
  startBaseId: optionalNumeric,
  endBaseId: optionalNumeric,
  startBase: optionalText,
  endBase: optionalText,
  dateFrom: optionalText,
  dateTo: optionalText,
  product: optionalText,
  price: optionalNumeric,
  currency: optionalText,
  startPrice: optionalNumeric,
  obligatoryExtrasPrice: optionalNumeric,
  obligatoryExtras: z.array(restExtrasSchema).optional().nullable(),
  paymentPlan: z.array(restPaymentSchema).optional().nullable(),
  securityDeposit: optionalNumeric,
  commissionPercentage: optionalNumeric,
  commissionValue: optionalNumeric,
  discountPercentage: optionalNumeric,
  // Only present when the /offers call passed showOptions=true.
  myReservationId: optionalNumeric,
});

export const restPriceSchema = z.looseObject({
  yachtId: numeric,
  dateFrom: optionalText,
  dateTo: optionalText,
  product: optionalText,
  price: optionalNumeric,
  currency: optionalText,
  startPrice: optionalNumeric,
  discountPercentage: optionalNumeric,
});

export const restAvailabilitySchema = z.looseObject({
  id: optionalNumeric,
  dateFrom: optionalText,
  dateTo: optionalText,
  yachtId: numeric,
  status: optionalNumeric,
  baseFromId: optionalNumeric,
  baseToId: optionalNumeric,
  optionExpirationDate: optionalText,
});

export const restShortAvailabilitySchema = z.looseObject({
  /** Yacht id - abbreviated by the vendor to keep the bulk payload small. */
  y: numeric,
  /** One character per day across the year, encoded per the `format` parameter. */
  bs: optionalText,
});

export const restInvoiceItemSchema = z.looseObject({
  name: optionalText,
  quantity: optionalNumeric,
  unit: optionalText,
  price: optionalNumeric,
  payableInBase: z.boolean().optional().nullable(),
});

export const restReservationSchema = z.looseObject({
  id: numeric,
  /** Present on agency reservations only. */
  charterReservationId: optionalNumeric,
  reservationCode: optionalText,
  dateFrom: optionalText,
  dateTo: optionalText,
  creationDate: optionalText,
  confirmationDate: optionalText,
  expirationDate: optionalText,
  yachtId: optionalNumeric,
  status: optionalNumeric,
  productName: optionalText,
  baseFromId: optionalNumeric,
  baseToId: optionalNumeric,
  currency: optionalText,
  clientName: optionalText,
  clientId: optionalNumeric,
  basePrice: optionalNumeric,
  discount: optionalNumeric,
  commission: optionalNumeric,
  finalPrice: optionalNumeric,
  clientPrice: optionalNumeric,
  items: z.array(restInvoiceItemSchema).optional().nullable(),
  paymentPlan: z.array(restPaymentSchema).optional().nullable(),
  bankDetails: optionalText,
  termsOfPayment: optionalText,
  remarks: optionalText,
});

export const restYachtListSchema = z.array(restYachtSchema);
export const restBaseListSchema = z.array(restBaseSchema);
export const restCompanyListSchema = z.array(restCompanySchema);
export const restShipyardListSchema = z.array(restShipyardSchema);
export const restCountryListSchema = z.array(restCountrySchema);
export const restWorldRegionListSchema = z.array(restWorldRegionSchema);
export const restSailingAreaListSchema = z.array(restSailingAreaSchema);
export const restEquipmentListSchema = z.array(restEquipmentSchema);
export const restYachtTypeListSchema = z.array(restYachtTypeSchema);
export const restOfferListSchema = z.array(restOfferSchema);
export const restPriceListSchema = z.array(restPriceSchema);
export const restAvailabilityListSchema = z.array(restAvailabilitySchema);
export const restShortAvailabilityListSchema = z.array(restShortAvailabilitySchema);
export const restReservationListSchema = z.array(restReservationSchema);

export type RestYacht = z.infer<typeof restYachtSchema>;
export type RestBase = z.infer<typeof restBaseSchema>;
export type RestCompany = z.infer<typeof restCompanySchema>;
export type RestShipyard = z.infer<typeof restShipyardSchema>;
export type RestCountry = z.infer<typeof restCountrySchema>;
export type RestWorldRegion = z.infer<typeof restWorldRegionSchema>;
export type RestSailingArea = z.infer<typeof restSailingAreaSchema>;
export type RestEquipment = z.infer<typeof restEquipmentSchema>;
export type RestYachtType = z.infer<typeof restYachtTypeSchema>;
export type RestOffer = z.infer<typeof restOfferSchema>;
export type RestPrice = z.infer<typeof restPriceSchema>;
export type RestAvailability = z.infer<typeof restAvailabilitySchema>;
export type RestShortAvailability = z.infer<typeof restShortAvailabilitySchema>;
export type RestReservation = z.infer<typeof restReservationSchema>;
export type RestExtras = z.infer<typeof restExtrasSchema>;
export type RestPayment = z.infer<typeof restPaymentSchema>;
