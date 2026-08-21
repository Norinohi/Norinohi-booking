import { z } from "zod";

import { looseJsonObject } from "../shared/json";

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
  /**
   * Undocumented, and the only status a successful DELETE ever answers with: the
   * vendor transitions the record rather than removing it. Measured 2026-08-20 on
   * company 225 across five deleted options, and the delete is idempotent (a
   * repeat returns 200 and status 5 again).
   */
  CANCELLED: 5,
} as const;

/**
 * Two further values are live and undocumented, named here so they log as
 * something other than "unknown" (both measured 2026-08-20):
 *
 * - `9`: a create that soft-conflicts with an existing hold. It carries no
 *   `expirationDate`, never appears in `/reservations/{year}` or
 *   `/availability/{year}`, and blocks nothing - a ghost record.
 * - `11`: a short vendor-side block, 387 rows across the account in 2026 and 119
 *   in 2027, mostly single days. Occupancy treats it as blocked; see
 *   `UNKNOWN_STATUS` in `occupancy.ts`.
 */
export const BM_RESERVATION_STATUS_NAMES = new Map<number, string>([
  [BM_RESERVATION_STATUS.RESERVATION, "RESERVATION"],
  [BM_RESERVATION_STATUS.OPTION, "OPTION"],
  [BM_RESERVATION_STATUS.OPTION_IN_EXPIRATION, "OPTION_IN_EXPIRATION"],
  [BM_RESERVATION_STATUS.SERVICE, "SERVICE"],
  [BM_RESERVATION_STATUS.CANCELLED, "CANCELLED"],
  [9, "CONFLICTING_CREATE"],
  [11, "VENDOR_BLOCK"],
]);

/** `format=3` on /shortAvailability: one character per day. */
export const BM_SHORT_AVAILABILITY_FORMAT = { BINARY: 1, HEX: 2, STATUS: 3 } as const;

// Numbers arrive as JSON numbers per the spec, but vendors routinely ship them
// as strings; coercing here rather than in the projection keeps the mapper pure.
const numeric = z.coerce.number();
const optionalNumeric = numeric.optional().nullable();
const optionalText = z.string().optional().nullable();

/*
 * Ids are carried as digit strings, never as numbers.
 *
 * The vendor's ids run to 19 digits and a float64 holds 15-16, so a number here is a
 * value we may have rewritten: `6614004890000100225` parses as
 * `6614004890000100000`, and `9046281455002103` as `9046281455002104` - which can be
 * a different real yacht. `BookingManagerClient` parses responses with
 * `parseExactJson`, which hands over the exact digits for any literal that would not
 * survive; this accepts either shape and settles on the string, so an id that did
 * round-trip is not stored in a second form.
 *
 * Deliberately not `z.coerce.string()`: coercing a number that has already been
 * rounded produces confident, wrong digits, whereas the union documents that both
 * shapes arrive and only one of them is trustworthy for a long id.
 */
const idDigits = /^-?\d+$/;

/*
 * The numeric branch cannot be `z.number().int()`: that caps at
 * `Number.MAX_SAFE_INTEGER`, which rejects exactly the ids `parseExactJson`
 * deliberately left as numbers. `/bases` ids run to 18 digits and round-trip fine
 * because they end in zeros, so they arrive numeric and are perfectly good - the bound
 * would refuse 1,296 of 1,297 bases for being large rather than for being wrong.
 *
 * The upper guard is about `String`, not about size: from 1e21 it switches to
 * exponential notation, and "1e+21" is not an id.
 */
const MAX_PRINTABLE_INTEGER = 1e21;
const integerId = z
  .number()
  .refine(
    (value) => Number.isInteger(value) && Math.abs(value) < MAX_PRINTABLE_INTEGER,
    "Expected an integer id that stringifies as digits",
  );

const id = z
  .union([z.string().regex(idDigits, "Expected an integer id"), integerId])
  .transform(String);

/*
 * Text the vendor sometimes sends as a bare number.
 *
 * An equipment `value` is the quantity or descriptor for a fitting, and it arrives as
 * `"2"` on 119,571 rows and as `2` on 2,107 - the same meaning in two shapes. Declaring
 * it text refused the numeric ones outright: an account-wide `/yachts` fetch failed
 * with 2,000+ issues, and per-company fetches quietly lost whichever company happened
 * to own them. `equipmentRaw` sends the same field always stringified, which is the
 * shape the projection reads, so both settle on text here rather than at each use.
 */
const optionalTextOrNumber = z
  .union([z.string(), z.number()])
  .transform(String)
  .optional()
  .nullable();
const optionalId = id.optional().nullable();

export const restImageSchema = looseJsonObject({
  name: optionalText,
  description: optionalText,
  url: optionalText,
  sortOrder: optionalNumeric,
});

export const restDocumentSchema = looseJsonObject({
  id: optionalId,
  name: optionalText,
  description: optionalText,
  url: optionalText,
  sortOrder: optionalNumeric,
});

export const restValidForBasesSchema = looseJsonObject({
  from: z.array(numeric).optional().nullable(),
  to: z.array(numeric).optional().nullable(),
});

/** One line of an offer's `discounts[]`. Undocumented; see `restOfferSchema`. */
export const restDiscountSchema = looseJsonObject({
  id: optionalId,
  name: optionalText,
  percentage: optionalNumeric,
  price: optionalNumeric,
  currency: optionalText,
});

export const restExtrasSchema = looseJsonObject({
  id: optionalId,
  name: optionalText,
  obligatory: z.boolean().optional().nullable(),
  price: optionalNumeric,
  currency: optionalText,
  unit: optionalText,
  payableInBase: z.boolean().optional().nullable(),
  includedDepositWaiver: z.boolean().optional().nullable(),
  validDaysFrom: optionalNumeric,
  validDaysTo: optionalNumeric,
  /**
   * The season the extra is charged for, which is how the vendor versions a fee across years:
   * this fleet's boat cleaning arrives three times, at 150 for 2026, 155 for 2027 and 160 for
   * 2028. Distinct from `validDateFrom`/`validDateTo`, which bound when it may be *booked* and
   * are set to sentinels a century out.
   */
  sailingDateFrom: optionalText,
  sailingDateTo: optionalText,
  /** Present only on a fee that applies to one route, which is what a one-way fee is. */
  validForBases: z.array(restValidForBasesSchema).optional().nullable(),
  validDateFrom: optionalText,
  validDateTo: optionalText,
  description: optionalText,
  availableInBase: optionalNumeric,
  validSailingAreas: z.array(numeric).optional().nullable(),
});

export const restProductSchema = looseJsonObject({
  name: optionalText,
  crewedByDefault: z.boolean().optional().nullable(),
  isDefaultProduct: z.boolean().optional().nullable(),
  extras: z.array(restExtrasSchema).optional().nullable(),
});

export const restDescriptionSchema = looseJsonObject({
  category: optionalText,
  text: optionalText,
  document: z.array(restDocumentSchema).optional().nullable(),
});

export const restCrewSchema = looseJsonObject({
  name: optionalText,
  description: optionalText,
  age: optionalNumeric,
  nationality: optionalText,
  roles: z.array(z.string()).optional().nullable(),
  licenses: optionalText,
  languages: z.array(z.string()).optional().nullable(),
  images: z.array(restDocumentSchema).optional().nullable(),
});

export const restEquipmentItemRawSchema = looseJsonObject({
  id: optionalId,
  parentId: optionalId,
  name: optionalText,
  // Always a string in 423,425 observed rows, but it is the same vendor field as
  // `equipment[].value`; letting the two disagree about type is how the drift stayed
  // invisible in one of them.
  value: optionalTextOrNumber,
  categoryName: optionalText,
});

/**
 * Note length/beam/cabins/berths sit on the YACHT here. NauSYS hangs them off
 * the model instead, which is exactly the mismatch that made the first NauSYS
 * import drop every listing - do not assume the two providers agree on where a
 * spec lives.
 */
export const restYachtSchema = looseJsonObject({
  id: id,
  name: optionalText,
  model: optionalText,
  modelId: optionalId,
  kind: optionalText,
  homeBaseId: optionalId,
  homeBase: optionalText,
  companyId: optionalId,
  company: optionalText,
  shipyardId: optionalId,
  year: optionalNumeric,
  certificate: optionalText,
  draught: optionalNumeric,
  beam: optionalNumeric,
  length: optionalNumeric,
  waterCapacity: optionalNumeric,
  fuelCapacity: optionalNumeric,
  engine: optionalText,
  deposit: optionalNumeric,
  /**
   * `0.0` on every yacht measured, which is indistinguishable from "no waiver
   * product configured" - the vendor exposes no waiver, damage-insurance or
   * deposit product among the extras either. Do not read `0` as "the waiver is
   * free"; see VENDOR QUESTION Q3.
   */
  depositWithWaiver: optionalNumeric,
  currency: optionalText,
  commissionPercentage: optionalNumeric,
  /**
   * Also present per yacht, not only on the company, and it can differ from the
   * company value. Enforcement is unverified - see VENDOR QUESTION Q2.
   */
  maxDiscountFromCommissionPercentage: optionalNumeric,
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
  /**
   * Weekday the vendor numbers 1 Sunday .. 7 Saturday, or -1 for "any day".
   * `allCheckInDays` carries the full list and is what the projection reads;
   * confirmed against the live test fleet, not the specification.
   */
  defaultCheckInDay: optionalNumeric,
  allCheckInDays: z.array(numeric).optional().nullable(),
  defaultCheckInTime: optionalText,
  defaultCheckOutTime: optionalText,
  minimumCharterDuration: optionalNumeric,
  maximumCharterDuration: optionalNumeric,
  maxPeopleOnBoard: optionalNumeric,
  images: z.array(restImageSchema).optional().nullable(),
  equipmentIds: z.array(id).optional().nullable(),
  equipment: z
    // `id` is load-bearing: the projection turns it into the `booking_manager:<id>`
    // amenity code the resolver splits back apart to name extras to the vendor, so a
    // rounded one here is a wrong extra. Missed by the first pass over this file
    // because it is inline rather than one field per line.
    .array(looseJsonObject({ id: optionalId, value: optionalTextOrNumber }))
    .optional()
    .nullable(),
  equipmentRaw: z.array(restEquipmentItemRawSchema).optional().nullable(),
  products: z.array(restProductSchema).optional().nullable(),
  descriptions: z.array(restDescriptionSchema).optional().nullable(),
  crew: z.array(restCrewSchema).optional().nullable(),
});

export const restBaseSchema = looseJsonObject({
  id: id,
  name: optionalText,
  city: optionalText,
  country: optionalText,
  address: optionalText,
  // Latitude/longitude are declared as strings in the spec, not numbers.
  latitude: optionalText,
  longitude: optionalText,
  countryId: optionalId,
  sailingAreas: z.array(numeric).optional().nullable(),
});

export const restCompanySchema = looseJsonObject({
  id: id,
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

export const restShipyardSchema = looseJsonObject({
  id: id,
  name: optionalText,
  shortName: optionalText,
});

/**
 * Both spellings of the ISO fields are accepted because the two vendor sources
 * disagree: the Swagger declares `short`/`long`, while the worked example in the
 * vendor's own integration guide returns `shortName`/`longName`. Reading only one
 * would not throw, since these schemas are loose. It would silently drop every
 * country code, and the ISO code is what makes the same country from Booking
 * Manager and NauSYS one row.
 */
export const restCountrySchema = looseJsonObject({
  id: id,
  name: optionalText,
  short: optionalText,
  long: optionalText,
  shortName: optionalText,
  longName: optionalText,
  worldRegion: optionalNumeric,
});

export const restWorldRegionSchema = looseJsonObject({ id: numeric, name: optionalText });

export const restSailingAreaSchema = looseJsonObject({ id: numeric, name: optionalText });

export const restEquipmentSchema = looseJsonObject({ id: numeric, name: optionalText });

export const restYachtTypeSchema = looseJsonObject({ name: z.string() });

export const restPaymentSchema = looseJsonObject({
  date: optionalText,
  amount: optionalNumeric,
});

export const restOfferSchema = looseJsonObject({
  yachtId: id,
  yacht: optionalText,
  startBaseId: optionalId,
  endBaseId: optionalId,
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
  /**
   * Constant `0` on every offer measured (3,026 in one account-wide week), so it
   * carries no information today. Declared so a future non-zero value is visible
   * rather than swallowed by `looseJsonObject`.
   */
  status: optionalNumeric,
  /**
   * The itemised breakdown behind `discountPercentage`, and the only place a
   * discount's name appears ("Early Booking A 2027"). Present on 1,016 of 3,026
   * offers in one account-wide week; the line prices sum to
   * `startPrice - price` exactly.
   */
  discounts: z.array(restDiscountSchema).optional().nullable(),
  /**
   * Only present when the /offers call passed showOptions=true - and it is an
   * output, not an echo of anything we sent: it carries the vendor's own
   * agency-side reservation id for an option we already hold on this yacht and
   * period. See `createOption` in booking.ts.
   */
  myReservationId: optionalId,
});

export const restPriceSchema = looseJsonObject({
  yachtId: id,
  dateFrom: optionalText,
  dateTo: optionalText,
  product: optionalText,
  price: optionalNumeric,
  currency: optionalText,
  startPrice: optionalNumeric,
  discountPercentage: optionalNumeric,
});

export const restAvailabilitySchema = looseJsonObject({
  id: optionalId,
  dateFrom: optionalText,
  dateTo: optionalText,
  yachtId: id,
  status: optionalNumeric,
  baseFromId: optionalId,
  baseToId: optionalId,
  optionExpirationDate: optionalText,
});

export const restShortAvailabilitySchema = looseJsonObject({
  /** Yacht id - abbreviated by the vendor to keep the bulk payload small. */
  y: numeric,
  /** One character per day across the year, encoded per the `format` parameter. */
  bs: optionalText,
});

export const restInvoiceItemSchema = looseJsonObject({
  name: optionalText,
  quantity: optionalNumeric,
  unit: optionalText,
  price: optionalNumeric,
  payableInBase: z.boolean().optional().nullable(),
});

export const restReservationSchema = looseJsonObject({
  id: id,
  /** Present on agency reservations only. */
  charterReservationId: optionalId,
  reservationCode: optionalText,
  dateFrom: optionalText,
  dateTo: optionalText,
  creationDate: optionalText,
  confirmationDate: optionalText,
  expirationDate: optionalText,
  yachtId: optionalId,
  status: optionalNumeric,
  productName: optionalText,
  baseFromId: optionalId,
  baseToId: optionalId,
  currency: optionalText,
  clientName: optionalText,
  clientId: optionalId,
  basePrice: optionalNumeric,
  discount: optionalNumeric,
  commission: optionalNumeric,
  finalPrice: optionalNumeric,
  clientPrice: optionalNumeric,
  items: z.array(restInvoiceItemSchema).optional().nullable(),
  paymentPlan: z.array(restPaymentSchema).optional().nullable(),
  /**
   * What we owe the charter, as opposed to `paymentPlan`, which is what the guest
   * owes. Present only on the charter-side record (the agency-side twin carries
   * `null`) and undocumented. Measured 2026-08-20: for a 4500.00 charter with
   * 600.00 commission, `paymentPlan` was 2 x 2250.00 and `agencyPaymentPlan` was
   * 2 x 1950.00, i.e. `clientPrice - commission`. Neither can be derived from the
   * `/offers` plan, which covers `price` alone and excludes non-`payableInBase`
   * extras.
   */
  agencyPaymentPlan: z.array(restPaymentSchema).optional().nullable(),
  bankDetails: optionalText,
  termsOfPayment: optionalText,
  remarks: optionalText,
});

/**
 * Just enough of any collection to read its ids.
 *
 * The id repair needs ids and nothing else, and validating the rest would couple a
 * one-off migration to every unrelated strictness question in the full schemas.
 */
export const restIdListSchema = z.array(looseJsonObject({ id }));

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
