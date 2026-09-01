import { z } from "zod";

export const providerKeySchema = z.enum(["mock", "booking_manager", "nausys"]);
export type ProviderKey = z.infer<typeof providerKeySchema>;

export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().length(3),
});
export type Money = z.infer<typeof moneySchema>;

export const listingSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  category: z.string(),
  builder: z.string(),
  model: z.string(),
  operator: z.string(),
  base: z.object({
    id: z.string(),
    name: z.string(),
    location: z.string(),
    region: z.string(),
    country: z.string(),
    lat: z.number(),
    lng: z.number(),
  }),
  specs: z.object({
    lengthM: z.number(),
    cabins: z.number().int(),
    berths: z.number().int(),
    heads: z.number().int(),
    yearBuilt: z.number().int(),
  }),
  rating: z.number(),
  reviewCount: z.number().int(),
  mainImage: z.string().url(),
  gallery: z.array(z.string().url()),
  amenities: z.array(z.string()),
  priceFrom: moneySchema,
  providerSourceId: z.string(),
});
export type ListingSummary = z.infer<typeof listingSummarySchema>;

export const availabilitySearchSchema = z.object({
  destination: z.string().optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  guests: z.number().int().positive().optional(),
  category: z.string().optional(),
  minCabins: z.number().int().positive().optional(),
  maxPriceMinor: z.number().int().positive().optional(),
  currency: z.string().length(3).default("EUR"),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(12),
});
export type AvailabilitySearch = z.input<typeof availabilitySearchSchema>;
export type NormalizedAvailabilitySearch = z.output<typeof availabilitySearchSchema>;

export const availableOfferSchema = z.object({
  id: z.string(),
  listing: listingSummarySchema,
  provider: providerKeySchema,
  checkIn: z.string(),
  checkOut: z.string(),
  nights: z.number().int(),
  guests: z.number().int(),
  clientPrice: moneySchema,
  obligatoryExtras: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      price: moneySchema,
    }),
  ),
  priceSourceHash: z.string(),
});
export type AvailableOffer = z.infer<typeof availableOfferSchema>;

export const listingPeriodSchema = z.object({
  listingId: z.string(),
  from: z.iso.date(),
  to: z.iso.date(),
  currency: z.string().length(3).default("EUR"),
});
export type ListingPeriod = z.input<typeof listingPeriodSchema>;

export const availabilityCalendarSchema = z.object({
  listingId: z.string(),
  slots: z.array(
    z.object({
      startDate: z.string(),
      endDate: z.string(),
      status: z.enum(["available", "option", "occupied", "blocked"]),
      price: moneySchema.optional(),
      minNights: z.number().int(),
      checkinWeekday: z.number().int().min(0).max(6),
      checkoutWeekday: z.number().int().min(0).max(6),
    }),
  ),
});
export type AvailabilityCalendar = z.infer<typeof availabilityCalendarSchema>;

/**
 * How the yacht is crewed for this charter. A pricing input rather than a listing
 * attribute: the same hull is offered bareboat or skippered at different prices,
 * and the booking sidebar lets the customer switch between them.
 */
export const crewTypeSchema = z.enum(["bareboat", "skipper", "full-crew"]);
export type CrewType = z.infer<typeof crewTypeSchema>;

export const quoteRequestSchema = z.object({
  listingId: z.string(),
  // Validated as dates, not merely as strings: these reach a SQL date column, and
  // an empty one used to surface as a 500 rather than a rejected request.
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
  guests: z.number().int().positive(),
  extras: z.array(z.string()).default([]),
  /** Omitted means the customer has not chosen; adapters add no crew for it. */
  crewType: crewTypeSchema.optional(),
  /**
   * Provider-side base to drop the yacht at, for a fleet that sells one-way.
   *
   * Omitted means the customer has not asked to finish anywhere in particular, and the adapter
   * prices the charter that returns to its own base. It is never inferred: a one-way costs more
   * and lands the customer in a different town, so it has to be something they chose.
   */
  endBaseId: z.string().optional(),
  currency: z.string().length(3).default("EUR"),
});

/** What the API accepts — the provider never sees our promo codes. */
export const quoteRequestWithDiscountSchema = quoteRequestSchema.extend({
  discountCode: z.string().trim().max(64).optional(),
  /** Spend available referral credit. Ignored for anonymous visitors. */
  applyCredit: z.boolean().optional(),
});
export type QuoteRequest = z.input<typeof quoteRequestSchema>;

export const providerQuoteSchema = z.object({
  id: z.string(),
  provider: providerKeySchema,
  listingId: z.string(),
  providerSourceId: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.number().int(),
  /** Echoed from the request so the caller never has to remember what it asked. */
  crewType: crewTypeSchema.nullable().default(null),
  currency: z.string().length(3),
  lines: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      amount: moneySchema,
      // Most extras are settled with the base on arrival, not with us. They count
      // toward the total but never toward the prepayment.
      payWhen: z.enum(["now", "at_check_in"]).default("now"),
      /**
       * What the line represents. `base` is the charter price itself — the only
       * thing internal price rules move, and what the admin Manage Prices screen
       * edits. Adapters must mark exactly one line as `base`.
       */
      kind: z.enum(["base", "extra", "fee", "adjustment", "discount", "credit"]).default("extra"),
      /**
       * Which section of the booking summary the line belongs to. `kind` says what
       * a line is to the pricing pipeline; this says how the customer sees it
       * grouped, which `kind` cannot answer — an unavoidable cleaning fee and an
       * optional hot tub are both charges against the same yacht. Absent on lines
       * that belong to no section (the base, discounts, credit).
       */
      group: z.enum(["mandatory", "optional", "crew"]).optional(),
    }),
  ),
  total: moneySchema,
  deposit: moneySchema,
  /**
   * Refundable security deposit taken at check-in and returned afterwards.
   * Excluded from `total` — the booking summary lists it separately and it is not
   * revenue.
   */
  securityDeposit: moneySchema.optional(),
  paymentPolicy: z.object({
    mode: z.enum(["deposit", "full"]),
    depositPct: z.number(),
    balanceDueAt: z.string().optional(),
  }),
  /**
   * The canonical extra codes this offer can actually price for this period, or
   * null where the provider's offer does not say.
   *
   * Not the same question as the catalogue's `selectable`, which asks whether an
   * adapter can ever match a code at all. An operator lists everything it sells
   * across every season, and a given week prices only part of that: before this
   * the sidebar offered the whole catalogue and dropped whatever the vendor had
   * not quoted, without saying so.
   *
   * Carries the amount as well as the code, because the catalogue's figure is a
   * unit price against a measure the operator chose ("per person") and the offer
   * multiplies it by a quantity the operator also chose. Only this is what ticking
   * the box will actually add.
   *
   * `payWhen` for the same reason: the two sources genuinely disagree — an extra the
   * catalogue files as settled at the base can arrive on the offer as payable up
   * front, and it is the offer the customer is about to pay.
   *
   * Null means "the offer does not report it", never "none": a provider that
   * publishes no per-period extras must not have its whole list greyed out.
   */
  offeredExtras: z
    .array(
      z.object({
        code: z.string(),
        amount: moneySchema,
        payWhen: z.enum(["now", "at_check_in"]),
      }),
    )
    .nullable()
    .default(null),
  /**
   * The provider-side bases this price is for, where the offer named them.
   *
   * Load-bearing, not informational. A fleet that sells one-way is quoted one offer per base
   * pair and they differ in money, so the pair the customer was priced on is the pair the
   * reservation has to open. The booking used to send the listing's home base for both ends
   * regardless, which is wrong the moment a boat is not at home: on the week of 26 September
   * 2026 every offer for this hull started at Portumna while its listing says Carrick.
   *
   * Null where the provider does not state bases; the booking then falls back to the listing's.
   */
  route: z
    .object({ startBaseId: z.string().optional(), endBaseId: z.string().optional() })
    .nullable()
    .default(null),
  /**
   * Every route the provider would sell for this exact period, priced all-in.
   *
   * The provider answers a one-way fleet with one offer per base pair, and until now all but
   * one were discarded. They are the only honest source for a drop-off control: the catalogue
   * says which pairs exist in principle, this says which are sellable that week and what each
   * costs, including the directional one-way fee.
   *
   * A single entry means the charter has one shape and the customer has nothing to choose.
   */
  routeOptions: z
    .array(
      z.object({
        startBaseId: z.string().optional(),
        endBaseId: z.string().optional(),
        startBaseName: z.string().optional(),
        endBaseName: z.string().optional(),
        isOneWay: z.boolean(),
        total: moneySchema,
      }),
    )
    .default([]),
  priceSourceHash: z.string(),
  expiresAt: z.string(),
  repriced: z.boolean(),
});
export type ProviderQuote = z.infer<typeof providerQuoteSchema>;

export const bookingDraftSchema = z.object({
  listingId: z.string(),
  quoteId: z.string(),
  /** ISO `yyyy-MM-dd`. The charter period every provider needs to open a reservation. */
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
  guests: z.number().int().positive(),
  extras: z.array(z.string()).default([]),
  /** Carried from the quote: re-pricing without it would price a different trip. */
  crewType: crewTypeSchema.optional(),
  /*
   * Also carried from the quote, and for the same reason. A vendor that converts on request
   * answers the same charter in whatever money it was asked for, so re-pricing in a different
   * one observes a different price and the hash below can never match. Optional because a
   * provider that publishes in one currency has nothing to carry; the adapter falls back to
   * its own configured currency.
   */
  currency: z.string().length(3).optional(),
  /**
   * The hash of the price the customer agreed to. Adapters re-price before holding
   * and refuse on a mismatch. For providers whose quote call creates no
   * provider-side artifact this is the only link between the two moments.
   */
  priceSourceHash: z.string(),
  /** The bases the quote was priced for; see `route` on `providerQuoteSchema`. */
  route: z
    .object({ startBaseId: z.string().optional(), endBaseId: z.string().optional() })
    .nullish(),
  customer: z.object({
    name: z.string(),
    surname: z.string().optional(),
    email: z.string().email(),
    phone: z.string().optional(),
    address: z.string().optional(),
    zip: z.string().optional(),
    city: z.string().optional(),
    countryCode: z.string().optional(),
  }),
  /** Carried from the option step: confirming needs the handle it produced. */
  reservation: z
    .object({
      providerReservationId: z.string(),
      providerOptionId: z.string().optional(),
      securityToken: z.string().optional(),
    })
    .optional(),
});
export type BookingDraft = z.infer<typeof bookingDraftSchema>;

export const providerReservationSchema = z.object({
  id: z.string(),
  provider: providerKeySchema,
  listingId: z.string(),
  quoteId: z.string(),
  status: z.enum(["option_held", "confirmed", "cancelled"]),
  providerReservationId: z.string().optional(),
  providerOptionId: z.string().optional(),
  /**
   * Rotating per-reservation security token (the NauSYS `uuid`). It changes
   * whenever important reservation data changes, so the caller must persist the
   * value returned by every call and send back the latest one.
   */
  securityToken: z.string().optional(),
  holdExpiresAt: z.string().optional(),
  /**
   * Where the customer completes the crew list on the provider's own site, when the
   * provider hosts one (NauSYS `crewlistlink`). Forwarding it is what the vendor
   * sanctioned in place of us collecting passport data and posting it back.
   *
   * Deliberately a plain string, not `z.url()`: this arrives on the response that
   * confirms a booking, and a link the vendor mangled must not be what fails a
   * charter the customer has already paid for. The connector is what checks the
   * value is an http(s) URL, and omits it otherwise.
   */
  crewListLink: z.string().optional(),
});
export type ProviderReservation = z.infer<typeof providerReservationSchema>;

/** The handle a provider needs to act on a reservation it already owns. */
export const providerReservationRefSchema = z.object({
  providerReservationId: z.string(),
  securityToken: z.string().optional(),
});
export type ProviderReservationRef = z.infer<typeof providerReservationRefSchema>;

export const providerExtrasMutationSchema = z.object({
  ref: providerReservationRefSchema,
  extras: z.array(z.string()),
});
export type ProviderExtrasMutation = z.infer<typeof providerExtrasMutationSchema>;

/** Mirrors the `provider_resource_type` pgEnum, in the same order. */
export const providerResourceTypeSchema = z.enum([
  "yacht",
  "company",
  "base",
  "location",
  "region",
  "country",
  "model",
  "builder",
  "category",
  "amenity",
  "country_state",
  "equipment_category",
  "service",
  "price_measure",
  "season",
  "price_list",
  "discount_item",
  "sail_type",
  "steering_type",
  "engine_builder",
]);
export type ProviderResourceType = z.infer<typeof providerResourceTypeSchema>;

export const rawEntitySchema = z.object({
  resourceType: providerResourceTypeSchema,
  externalId: z.string(),
  /**
   * Bounds the removal sweep, e.g. the owning company of a yacht. Without it a
   * failed fetch of one company's fleet would deactivate every other company's.
   */
  scopeKey: z.string().optional(),
  payload: z.unknown(),
});
export type RawEntity = z.infer<typeof rawEntitySchema>;

export type ProviderRecordEntry = {
  externalId: string;
  scopeKey?: string;
  payload: unknown;
};

/** Everything a full catalogue dump ingested, grouped for the projection phase. */
export type ProviderRecordSet = Map<ProviderResourceType, ProviderRecordEntry[]>;

export const providerCapabilitiesSchema = z.object({
  supportsOptions: z.boolean(),
  supportsWebhooks: z.boolean(),
  /**
   * Whether the provider guarantees the hold until it says otherwise, which is what
   * makes charging before committing safe (D-PAYORDER).
   *
   * **Nothing reads this yet.** Every provider returns true, so checkout charges and
   * then confirms, and the false branch — hold first, charge after — has never been
   * written. A provider that returns false would silently get the wrong order, so
   * adding one means implementing that branch, not just the adapter.
   */
  optionExpiryOwnedByProvider: z.boolean(),
  supportsExtrasMutation: z.boolean(),
  supportsLiveQuote: z.boolean(),
  /** Shortest hold the provider grants, when it owns the expiry. */
  minHoldMinutes: z.number().int().positive().optional(),
});
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;

/* ------------------------------------------------------ catalogue projection */

/*
 * The output of the pure projection phase. Every id here is the provider's own
 * external id: the writer resolves them to ours through `provider_record` and
 * `listing_source`, which is also what keeps two providers' ids from colliding.
 */

/**
 * Display names in the locales the site serves, keyed by BCP 47 tag. Absent where the
 * provider publishes one language only.
 *
 * The English name stays on `name`: it is what the search filters and `listing_search_doc`
 * match against, so a translated value would silently unmatch every listing carrying it.
 * These are labels for display and nothing else.
 */
const canonicalTranslationsSchema = z.record(z.string(), z.string()).optional();

const canonicalCountrySchema = z.object({
  externalId: z.string(),
  code: z.string(),
  name: z.string(),
  translations: canonicalTranslationsSchema,
});

const canonicalRegionSchema = z.object({
  externalId: z.string(),
  externalCountryId: z.string(),
  name: z.string(),
  translations: canonicalTranslationsSchema,
});

const canonicalLocationSchema = z.object({
  externalId: z.string(),
  externalRegionId: z.string(),
  name: z.string(),
  translations: canonicalTranslationsSchema,
});

const canonicalBaseSchema = z.object({
  externalId: z.string(),
  externalLocationId: z.string(),
  name: z.string(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  checkInTime: z.string().optional(),
  checkOutTime: z.string().optional(),
});

const canonicalOperatorSchema = z.object({
  externalId: z.string(),
  name: z.string(),
  slug: z.string(),
  country: z.string().optional(),
  city: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  /**
   * The operator's full terms, in their own words and language, shown to a guest
   * before they commit because they carry the cancellation policy. Optional:
   * Booking Manager publishes one for 45% of companies, NauSYS for none.
   */
  termsAndConditions: z.string().optional(),
});

const canonicalBuilderSchema = z.object({
  externalId: z.string(),
  name: z.string(),
  slug: z.string().optional(),
});

const canonicalModelSchema = z.object({
  externalId: z.string(),
  externalBuilderId: z.string().optional(),
  name: z.string(),
});

const canonicalCategorySchema = z.object({
  externalId: z.string(),
  code: z.string().optional(),
  name: z.string(),
  translations: canonicalTranslationsSchema,
});

const canonicalAmenityCategorySchema = z.object({
  externalId: z.string(),
  name: z.string(),
});

const canonicalAmenitySchema = z.object({
  externalId: z.string(),
  externalAmenityCategoryId: z.string(),
  code: z.string().optional(),
  name: z.string(),
  translations: canonicalTranslationsSchema,
});

/**
 * A priced extra the provider sells alongside the hull.
 *
 * Separate from `canonicalAmenitySchema` because the two answer different
 * questions: an amenity is equipment the yacht has, an extra is something the
 * customer pays for. Providers key them in different id spaces too, which `kind`
 * records so the writer never collides a service with an equipment of the same
 * number.
 *
 * The price is the season's published list price, not a quote. What a customer
 * actually owes for concrete dates comes from the offer path, which prices the
 * same items per period and quantity.
 */
/**
 * The crew-list fields a fleet operator requires for one reservation, in the vendor's own
 * field names. Empty where the operator asks for nothing beyond the obvious, null where the
 * provider does not answer the question at all -- which is not the same thing.
 */
export interface CrewRequirements {
  requiredFields: string[];
  maxPassengers: number | null;
  skipperRequired: boolean | null;
}

/**
 * One person aboard, in our own vocabulary: ISO dates and alpha-2 countries, the way every
 * other canonical structure here states them. Each adapter converts to whatever its vendor
 * wants -- NauSYS takes `dd.MM.yyyy` and alpha-3, and neither belongs in the application.
 *
 * Given and family name are separate because the operator files them separately, and the
 * split cannot be recovered from a full name: the vendor's own example carries "DR. MED.
 * DRED" as a surname. Everything but the name is optional, since the point of submitting an
 * incomplete list is that the base has less to collect at the desk, not none.
 */
export const crewListMemberSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  skipper: z.boolean(),
  /** ISO `yyyy-mm-dd`. */
  dateOfBirth: z.string().optional(),
  birthPlace: z.string().optional(),
  birthCountry: z.string().length(2).optional(),
  nationality: z.string().length(2).optional(),
  documentType: z.enum(["PASSPORT", "IDCARD", "OTHER"]).optional(),
  documentNumber: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  livingPlace: z.string().optional(),
  livingCountry: z.string().length(2).optional(),
  skipperLicence: z.string().optional(),
  vhfLicence: z.string().optional(),
  skipperEmail: z.string().optional(),
  skipperMobile: z.string().optional(),
  /**
   * When this person is aboard, ISO `yyyy-mm-dd`. Not asked of the customer: an operator that
   * requires them means the charter dates, which the booking already knows, and a passenger
   * who joins late is rare enough to belong in the note.
   */
  embarkDate: z.string().optional(),
  disembarkDate: z.string().optional(),
});
export type CrewListMember = z.infer<typeof crewListMemberSchema>;

export const crewListSubmissionSchema = z.object({
  ref: providerReservationRefSchema,
  members: z.array(crewListMemberSchema).max(50),
  note: z.string().optional(),
});
export type CrewListSubmission = z.infer<typeof crewListSubmissionSchema>;

/**
 * What the operator said about the list we sent.
 *
 * `accepted: false` is a real answer, not an error: NauSYS refuses a list whose passengers do
 * not cover the charter dates and names the period it means. Anything we could not send at all
 * throws instead, so a caller that gets a receipt knows the operator saw the list.
 */
/**
 * A place the operator's crew list will accept. `name` is what gets filed; `label` names the
 * municipality around it, which is how a customer picks between two places sharing a name.
 */
export interface CrewPlace {
  name: string;
  label: string;
}

export interface CrewListReceipt {
  accepted: boolean;
  /** The vendor's own status name, where it gave one. */
  providerCode?: string;
  message?: string;
  /** ISO dates the vendor says the list fails to cover. */
  invalidPeriod?: { from: string; to: string };
}

export const canonicalExtraSchema = z.object({
  kind: z.enum(["service", "equipment"]),
  externalId: z.string(),
  name: z.string(),
  translations: canonicalTranslationsSchema,
  obligatory: z.boolean(),
  priceMinor: z.number().int(),
  priceCurrency: z.string().length(3),
  /** Vendor's billing unit (per booking, per day, per person); display only. */
  priceMeasure: z.string().optional(),
  calculationType: z.string().optional(),
  /**
   * A fee stated as a share of the charter: 0.35 is 35%. `priceMinor` is zero on these, since
   * the amount is only knowable once a week is being priced, and reading the vendor's rate as
   * money turned a 35% service charge into 35 cents.
   */
  percentage: z.number().positive().optional(),
  /** What the rate applies to, in the vendor's own words: PRICELIST_PRICE, CLIENT_PRICE, ... */
  percentageBasis: z.string().optional(),
  /**
   * Whether the operator collects this at the base rather than in the prepayment. Left unset
   * where the provider says nothing, which is not the same as false: claiming a fee is due on
   * arrival when it was already charged is the error this replaced.
   */
  payableInBase: z.boolean().optional(),
  /**
   * The sailing dates this price is for, where the provider versions a fee by season. Both ends
   * optional: a fee that never changes carries neither, and one that only opens carries a start.
   */
  seasonStart: z.string().optional(),
  seasonEnd: z.string().optional(),
  /**
   * The charter lengths in nights this price is for, where the provider prices a fee by
   * duration. Le Boat's moorings fee is 60 EUR for one to six nights and 90 for seven or
   * more, filed as one row per night count; taking the cheapest advertised a weekly charter
   * 30 EUR under what the offer then charged.
   */
  validNightsFrom: z.number().int().optional(),
  validNightsTo: z.number().int().optional(),
  /**
   * Charged only when the charter ends somewhere other than it started. Listing one of these as
   * an unconditional mandatory extra overstates every return charter by its amount.
   */
  oneWayOnly: z.boolean().optional(),
  /**
   * The bases this price applies at, by the provider's own base ids. Empty or absent means
   * every base, which is the common case; a non-empty list is a fee only charged where the
   * charter starts at one of these -- 130,535 of NauSYS's 184,539 priced extras rows carry
   * one, and applying them everywhere put fees on cards no charter from that base pays.
   */
  validForBaseIds: z.array(z.string()).optional(),
  /**
   * A floor the provider sets under a computed total, in minor units. Only meaningful beside a
   * percentage: a 3% fee with a 50 EUR minimum is 50 EUR on a small charter, not 30.
   */
  minimumPriceMinor: z.number().int().optional(),
  /** Cannot be added without the operator agreeing first, so it is not instantly bookable. */
  onRequestOnly: z.boolean(),
  /**
   * Buying this lowers the security deposit rather than adding a service to the charter.
   * NauSYS flags the service itself (`depositInsurance`) and publishes the reduced figure
   * beside the ordinary one, so a customer who takes it is asked for less at the base -- and
   * was still shown the full deposit until this was read.
   */
  depositInsurance: z.boolean().optional(),
  /**
   * Set when this extra is really a crew role. Vendors sell crew as ordinary
   * services with no flag saying so, so this is read off the name and left unset
   * whenever the name does not clearly say which role it is.
   */
  crewRole: z.enum(["skipper", "hostess", "cook"]).optional(),
  externalSeasonId: z.string().optional(),
  externalBaseId: z.string().optional(),
});
export type CanonicalExtra = z.infer<typeof canonicalExtraSchema>;

const canonicalListingSchema = z.object({
  externalId: z.string(),
  externalCompanyId: z.string(),
  externalBaseId: z.string(),
  externalBuilderId: z.string().optional(),
  externalModelId: z.string().optional(),
  externalCategoryId: z.string().optional(),
  /**
   * The boat's own name, as the vendor wrote it, with no model appended.
   *
   * Carried beside `title` rather than recovered from it: stripping a model back off a merged
   * string is guesswork the moment a vendor writes the model differently in the two fields,
   * and the display needs the halves apart while slugs and `<title>` need them joined.
   */
  name: z.string().optional(),
  title: z.string(),
  slug: z.string(),
  spec: z.object({
    lengthM: z.number(),
    beamM: z.number().optional(),
    draftM: z.number().optional(),
    cabins: z.number().int(),
    berths: z.number().int(),
    heads: z.number().int(),
    /**
     * Separate from `heads` because the two are not the same fitting: a head is the
     * WC compartment, and a yacht can carry more or fewer showers than it has of
     * them. Optional because only NauSYS states a count at all, and it leaves the
     * field at zero for most of its fleet, so an absent value means unknown rather
     * than none.
     */
    showers: z.number().int().optional(),
    yearBuilt: z.number().int(),
    engines: z.number().int().optional(),
    fuelCapacity: z.number().int().optional(),
    waterCapacity: z.number().int().optional(),
    /** Rig, resolved against the provider's own reference list rather than left as an id. */
    sailType: z.string().optional(),
  }),
  /** How the boat is sold. Backs the Crew filter, so it is left unset rather than guessed. */
  crewType: crewTypeSchema.optional(),
  media: z.array(
    z.object({
      externalUrl: z.string(),
      role: z.enum(["main", "layout", "gallery"]),
      sortOrder: z.number().int(),
    }),
  ),
  amenities: z.array(z.string()),
  /* Defaulted: a provider with no extras feed still produces a valid listing. */
  extras: z.array(canonicalExtraSchema).default([]),
  texts: z.array(
    z.object({
      kind: z.enum(["description", "notes", "conditions", "one_way_note"]),
      locale: z.string(),
      value: z.string(),
    }),
  ),
  checkinRules: z.array(
    z.object({
      checkinWeekday: z.number().int().min(0).max(6).optional(),
      checkoutWeekday: z.number().int().min(0).max(6).optional(),
      minNights: z.number().int().positive().optional(),
      maxNights: z.number().int().positive().optional(),
      /* `yyyy-MM-dd`, both ends inclusive: the season the rule governs, absent where the
         provider states one set of terms for all time. */
      seasonStart: z.string().optional(),
      seasonEnd: z.string().optional(),
    }),
  ),
  oneWayRules: z.array(
    z.object({
      startDate: z.string(),
      endDate: z.string(),
      isOneWay: z.boolean(),
    }),
  ),
  defaultCurrency: z.string().length(3),
  securityDepositMinor: z.number().int().optional(),
  /**
   * What the deposit falls to when the charter carries deposit insurance. Absent unless the
   * operator publishes a different figure, which is how NauSYS states it.
   */
  securityDepositWhenInsuredMinor: z.number().int().optional(),
  /** Unset means the deposit is denominated in `defaultCurrency`. */
  securityDepositCurrency: z.string().length(3).optional(),
  /** Provider-side review aggregate. Left unset when the provider has no verdict. */
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  paymentPolicy: z
    .object({
      mode: z.enum(["deposit", "full"]),
      depositPct: z.number().optional(),
      balanceDueAt: z.string().optional(),
    })
    .optional(),
});

export const canonicalCatalogueSchema = z.object({
  countries: z.array(canonicalCountrySchema),
  regions: z.array(canonicalRegionSchema),
  locations: z.array(canonicalLocationSchema),
  bases: z.array(canonicalBaseSchema),
  operators: z.array(canonicalOperatorSchema),
  builders: z.array(canonicalBuilderSchema),
  models: z.array(canonicalModelSchema),
  categories: z.array(canonicalCategorySchema),
  amenityCategories: z.array(canonicalAmenityCategorySchema),
  amenities: z.array(canonicalAmenitySchema),
  listings: z.array(canonicalListingSchema),
});
export type CanonicalCatalogue = z.infer<typeof canonicalCatalogueSchema>;
