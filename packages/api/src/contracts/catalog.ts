import { faqCategory } from "@yacht-charter/db/schema/content";
import { crewTypeSchema } from "@yacht-charter/providers";
import { z } from "zod";

import { currencySchema, moneySchema, paginationSchema } from "./primitives";

const stringArrayParamSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : [value]))
  .optional();

const booleanParamSchema = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform((value) => value === true || value === "true")
  .optional();

const facetOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative().optional(),
  /* Editorial fields, populated only for facet groups with facet_media rows. */
  imageUrl: z.string().nullish(),
  /* Cloudinary public_id — prefer it over imageUrl and build the delivery URL client-side. */
  cloudinaryId: z.string().nullish(),
  description: z.string().nullish(),
  /* Cheapest listing in the group — what a "from X" card label renders. */
  priceFromMinor: z.number().int().nullish(),
  currency: z.string().length(3).nullish(),
});

const numberRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
});

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()), {
    message: "Invalid date",
  });

export const includedItemSchema = z.object({
  code: z.string(),
  label: z.string(),
});

const pricedItemSchema = includedItemSchema.extend({
  price: moneySchema,
  /** Top of the range where one fee has several provider variants; null when there is one. */
  priceToMinor: z.number().int().nullable(),
  /**
   * What `price` is the price of, in the vendor's own words — "per person",
   * "per booking". Rendered as given: it is operator copy, not an enum we can
   * translate, and stating the wrong unit is what this exists to stop.
   */
  priceMeasure: z.string().nullable(),
  /** A share of the charter rather than an amount: 0.35 is 35%. Null on the ordinary ones. */
  percentage: z.number().nullable(),
  /** Where the fee is collected; null where the provider said nothing, so the page says nothing. */
  payableInBase: z.boolean().nullable(),
  /** Charged only on a charter that ends at a different base than it started. */
  oneWayOnly: z.boolean(),
  /** `included` means the charter price already covers it, so the page names it without a price. */
  pricingType: z.enum(["per_booking", "per_week", "pay_at_check_in", "included"]),
});

/**
 * An optional extra, plus whether the booking flow may offer it as a choice.
 *
 * Not every provider can price an extra at quote time. Booking Manager publishes
 * optional extras in its catalogue but exposes none on the offer it quotes from,
 * and NauSYS keys its offer extras in an id space we have only ever seen used for
 * services. An extra we cannot price must still be shown — the customer wants to
 * know it exists — but offering a checkbox that silently changes nothing is worse
 * than showing it as arrange-with-the-base.
 */
const optionalItemSchema = pricedItemSchema.extend({
  selectable: z.boolean(),
});

const reviewSchema = z.object({
  id: z.string(),
  rating: z.number(),
  author: z.string(),
  body: z.string(),
});

export const listingSummarySchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  category: z.string(),
  crewType: z.string().nullable(),
  badges: z.array(includedItemSchema),
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
    email: z.string().nullable(),
    phone: z.string().nullable(),
    website: z.string().nullable(),
    /* Wall-clock at the marina, e.g. "17:00". Render as given; it is not an instant. */
    checkInTime: z.string().nullable(),
    checkOutTime: z.string().nullable(),
  }),
  specs: z.object({
    lengthM: z.number(),
    cabins: z.number().int(),
    berths: z.number().int(),
    heads: z.number().int(),
    /* Null when the provider states no count, which is every Booking Manager
       listing and most NauSYS ones; the card leaves the row out rather than
       repeating the head count under a shower glyph. */
    showers: z.number().int().nullable(),
    yearBuilt: z.number().int(),
    sailType: z.string().nullable(),
  }),
  policies: z.object({
    depositInsuranceIncluded: z.boolean(),
    petsAllowed: z.boolean(),
    /**
     * The operator's full terms and conditions, verbatim and in their own
     * language, carrying the cancellation policy the checkout asks a guest to
     * accept. Rendered as given: it is their copy, not an enum we can localize,
     * and paraphrasing a contract someone is about to agree to would put our
     * words on their terms. Null where the operator published none (55% of them).
     */
    termsAndConditions: z.string().nullable(),
  }),
  availability: z.object({
    hasUnconfirmedAvailability: z.boolean(),
    hasAvailableDates: z.boolean(),
    hasTemporaryBooking: z.boolean(),
    /**
     * The first charter this listing would sell, for a card with no period of its own. Both
     * ends or neither: a start day on its own proves no legal check-out follows it, which is
     * how cards came to advertise dates the detail calendar then refused. Null once past.
     */
    bookablePeriod: z.object({ checkIn: z.string(), checkOut: z.string() }).nullable(),
  }),
  rating: z.number(),
  reviewCount: z.number().int(),
  bookingStats: z.object({
    bookedThisMonth: z.number().int(),
    viewedToday: z.number().int(),
  }),
  mainImage: z.string(),
  gallery: z.array(z.string()),
  amenities: z.array(z.string()),
  /* Null when the listing has no usable price. The UI quotes on request rather than a number. */
  priceFrom: moneySchema.nullable(),
  /**
   * True where `priceFrom` is the cheapest week of the operator's season rather than the price
   * of the charter beside it, so the card reads "From €X" instead of pricing those dates.
   */
  priceIsFrom: z.boolean(),
  /**
   * The same charter before the operator's own discount, to be rendered struck through beside
   * `priceFrom`. Null unless there is a discount the vendor's own figures account for, which is
   * the ordinary case.
   */
  listPriceFrom: moneySchema.nullable(),
  priceDetails: z.object({
    periodDays: z.number().int(),
    perPersonMinor: z.number().int().nullable(),
    /** Refundable damage deposit collected at the base. Null when there is none. */
    securityDeposit: moneySchema.nullable(),
    /**
     * What the guest leaves instead if they buy the yacht's damage waiver. Null unless the
     * operator states a genuinely lower figure, so a value here always beats `securityDeposit`.
     * The waiver itself is an optional extra and is not applied until the guest selects it.
     */
    securityDepositWhenInsured: moneySchema.nullable(),
  }),
});

/**
 * `viewer` is the browser's own anonymous id, used only to keep one visitor from
 * counting twice in a day. The server hashes it with the date before storing it,
 * so a client that sends a stable id still leaves no cross-day trail.
 */
export const recordListingViewInputSchema = z.object({
  id: z.string().min(1),
  viewer: z.string().min(8).max(128),
});

export const listingsByIdsInputSchema = z.object({
  /* Mirrors wishlistMergeInputSchema's cap — this is the guest wishlist's hydration path. */
  listingIds: z.array(z.string().min(1)).max(50),
});

export const listingDetailSchema = listingSummarySchema.extend({
  /**
   * The boat's own name, without the model - "Star Kiss" where `title` is "Star Kiss Sun
   * Odyssey 350". Null on a listing synced before the column existed and never re-synced.
   *
   * The two are carried apart so the page can show them apart. `title` stays the joined form
   * because slugs, `<title>` and structured data all want one string.
   */
  name: z.string().nullable(),
  /* Null when the provider ships no prose in the requested locale; the client writes its own. */
  description: z.string().nullable(),
  /* Null where the catalogue does not know; the web writes "not specified" in its own locale. */
  overview: z.array(includedItemSchema.extend({ value: z.string().nullable() })),
  /**
   * A walkthrough the operator filmed and a 360 tour of the same boat, where it published one.
   * Links rather than gallery entries: a visitor follows them off the page.
   */
  media: z.object({ videoUrl: z.string().nullable(), tourUrl: z.string().nullable() }),
  includedAmenities: z.array(includedItemSchema),
  mandatoryExtras: z.array(pricedItemSchema),
  optionalExtras: z.array(optionalItemSchema),
  /**
   * What the booking sidebar's Crew control may offer for this yacht, and what
   * each role costs. `options` is derived from how the operator sells the hull
   * and which roles it prices, so a crewed yacht never offers bareboat. The roles
   * are deliberately absent from `optionalExtras`: they are bought by choosing a
   * crew type on the quote, not by ticking an extra.
   */
  crew: z.object({
    options: z.array(crewTypeSchema),
    roles: z.array(pricedItemSchema),
  }),
  importantInformation: z.object({
    charterCompany: z.string(),
    yachtPickupAddress: z.string(),
    /* Times only: a listing page has no charter, so it has no pickup date to state. */
    yachtPickup: z.object({ time: z.string().nullable() }),
    yachtDropOff: z.object({ time: z.string().nullable() }),
    /* Which sentence applies, not the sentence: the copy is in the web app's message files. */
    cancellationPaymentPolicies: z.literal("varies_by_selection"),
    sailingLicenseRequired: z.enum(["required", "not_required"]),
    pets: z.enum(["allowed_with_confirmation", "ask_base"]),
    paymentMethodsAcceptedByCharterCompany: z.array(z.string()),
    marinaInformation: z.object({
      marina: z.string(),
      location: z.string(),
      country: z.string(),
    }),
    marinaContact: z.object({
      name: z.string(),
      address: z.string(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      website: z.string().nullable(),
    }),
    map: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
  }),
  /* Null on most listings: a route exists only where somebody wrote one for the charter base or
     its sailing region, and the detail page drops the section rather than showing an empty one. */
  suggestedRoute: z
    .object({
      title: z.string(),
      description: z.string().nullable(),
      stops: z.array(
        z.object({
          day: z.number().int(),
          name: z.string(),
          note: z.string().nullable(),
          lat: z.number(),
          lng: z.number(),
        }),
      ),
    })
    .nullable(),
  reviews: z.array(reviewSchema),
  /* Site-wide entries carry one of the six categories the page groups under; a listing's own
     entries carry none and render ahead of the groups. */
  faq: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      answer: z.string(),
      category: z.enum(faqCategory.enumValues).nullable(),
    }),
  ),
  popularYachts: z.array(listingSummarySchema),
});

/**
 * A generated catalog page. `filters` carries catalogue values, not the slugs in `segments`:
 * search normalizes by stripping non-alphanumerics, so a slugged "Mali Lošinj" no longer matches
 * the row it came from.
 */
export const catalogPageSchema = z.object({
  root: z.enum(["yacht-charter", "shipyard"]),
  kind: z.enum([
    "country",
    "geo",
    "marina",
    "type",
    "type-country",
    "type-geo",
    "type-marina",
    "builder",
    "model",
  ]),
  segments: z.array(z.string()),
  filters: z.object({
    country: z.string().optional(),
    region: z.string().optional(),
    city: z.string().optional(),
    marina: z.string().optional(),
    category: z.string().optional(),
    builder: z.string().optional(),
    model: z.string().optional(),
  }),
  labels: z.array(z.string()),
  count: z.number().int().nonnegative(),
});

/*
 * The longest charter a search may ask for. A year is far past anything anyone charters, so this
 * is a guard rather than a product rule: `availabilityWindowFor` builds the check-out by adding
 * the duration to the start date, and an unbounded one walks the Date past its range, where
 * `toISOString` throws and the request answers 500 instead of a validation error.
 */
const MAX_CHARTER_NIGHTS = 365;

export const listingSearchInputBaseSchema = z.object({
  destination: z.string().optional(),
  query: z.string().optional(),
  checkIn: dateStringSchema.optional(),
  checkOut: dateStringSchema.optional(),
  guests: z.coerce.number().int().positive().optional(),
  category: z.string().optional(),
  minCabins: z.coerce.number().int().positive().optional(),
  maxPriceMinor: z.coerce.number().int().positive().optional(),
  country: stringArrayParamSchema,
  sailingArea: stringArrayParamSchema,
  city: stringArrayParamSchema,
  charterCompany: stringArrayParamSchema,
  marina: stringArrayParamSchema,
  boatType: stringArrayParamSchema,
  builder: stringArrayParamSchema,
  model: stringArrayParamSchema,
  crew: stringArrayParamSchema,
  mainsailType: stringArrayParamSchema,
  equipment: stringArrayParamSchema,
  startDate: dateStringSchema.optional(),
  duration: z.coerce.number().int().positive().max(MAX_CHARTER_NIGHTS).optional(),
  dateFlexibility: z.enum(["on-day", "1-3-days", "1-week", "2-weeks", "1-month"]).optional(),
  minLength: z.coerce.number().nonnegative().optional(),
  maxLength: z.coerce.number().nonnegative().optional(),
  maxCabins: z.coerce.number().int().nonnegative().optional(),
  minBerths: z.coerce.number().int().nonnegative().optional(),
  maxBerths: z.coerce.number().int().nonnegative().optional(),
  minBathrooms: z.coerce.number().int().nonnegative().optional(),
  maxBathrooms: z.coerce.number().int().nonnegative().optional(),
  minPriceMinor: z.coerce.number().int().nonnegative().optional(),
  minBoatAge: z.coerce.number().int().nonnegative().optional(),
  maxBoatAge: z.coerce.number().int().nonnegative().optional(),
  yearFrom: z.coerce.number().int().optional(),
  yearTo: z.coerce.number().int().optional(),
  minGuestRating: z.coerce.number().min(0).max(5).optional(),
  maxGuestRating: z.coerce.number().min(0).max(5).optional(),
  withoutAvailabilityConfirmation: booleanParamSchema,
  underTemporaryBooking: booleanParamSchema,
  depositInsurance: booleanParamSchema,
  petsAllowed: booleanParamSchema,
  currency: currencySchema.default("EUR"),
  /* Mirrors apps/web/src/i18n/config.ts. Unknown values fall back to the default copy. */
  locale: z.string().min(2).max(10).default("en"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  sort: z
    .enum(["recommended", "price-asc", "price-desc", "rating", "newest"])
    .default("recommended"),
});

type ListingSearchValidationInput = {
  checkIn?: string;
  checkOut?: string;
  cursor?: string;
  page?: number;
};

const validateListingSearchInput = (
  input: ListingSearchValidationInput,
  context: z.RefinementCtx,
) => {
  if (input.cursor && input.page !== undefined) {
    context.addIssue({
      code: "custom",
      message: "Do not combine cursor with page pagination",
      path: ["page"],
    });
  }

  if (input.checkIn && input.checkOut && input.checkIn >= input.checkOut) {
    context.addIssue({
      code: "custom",
      message: "checkOut must be after checkIn",
      path: ["checkOut"],
    });
  }
};

export const listingSearchInputSchema = listingSearchInputBaseSchema.superRefine(
  validateListingSearchInput,
);

export const partialListingSearchInputSchema = listingSearchInputBaseSchema
  .partial()
  .default({})
  .superRefine(validateListingSearchInput);

export const searchResultSchema = z.object({
  items: z.array(
    z.object({
      listing: listingSummarySchema,
      checkIn: z.string().nullable(),
      checkOut: z.string().nullable(),
    }),
  ),
  nextCursor: z.string().optional(),
  pagination: paginationSchema.optional(),
});

export const facetsSchema = z.object({
  destinations: z.array(z.string()),
  categories: z.array(z.string()),
  amenities: z.array(z.string()),
  options: z.object({
    countries: z.array(facetOptionSchema),
    sailingAreas: z.array(facetOptionSchema),
    charterCompanies: z.array(facetOptionSchema),
    marinas: z.array(facetOptionSchema),
    durations: z.array(facetOptionSchema),
    dateFlexibility: z.array(facetOptionSchema),
    boatTypes: z.array(facetOptionSchema),
    models: z.array(facetOptionSchema),
    crews: z.array(facetOptionSchema),
    mainsailTypes: z.array(facetOptionSchema),
    equipment: z.array(facetOptionSchema),
    lengthUnits: z.array(facetOptionSchema),
    years: z.array(facetOptionSchema),
  }),
  ranges: z.object({
    length: numberRangeSchema,
    cabins: numberRangeSchema,
    berths: numberRangeSchema,
    bathrooms: numberRangeSchema,
    price: z.object({
      minMinor: z.number().int(),
      maxMinor: z.number().int(),
      currency: z.string().length(3),
    }),
    boatAge: numberRangeSchema,
    year: numberRangeSchema,
    guestRating: numberRangeSchema,
  }),
  toggles: z.object({
    withoutAvailabilityConfirmation: z.boolean(),
    underTemporaryBooking: z.boolean(),
    depositInsurance: z.boolean(),
    petsAllowed: z.boolean(),
  }),
  priceRange: z.object({
    minMinor: z.number().int(),
    maxMinor: z.number().int(),
    currency: z.string().length(3),
  }),
});

/**
 * The map's own answer: one entry per marina, with how many of the search's boats lie there.
 *
 * No card rides along. A pin needs a place, a count and a price to show; the card belongs to the
 * one marina somebody opens, and is fetched then.
 */
export const mapMarinaResultSchema = z.object({
  marinas: z.array(
    z.object({
      baseId: z.string(),
      name: z.string(),
      lat: z.number(),
      lng: z.number(),
      count: z.number().int(),
      priceFromMinor: z.number().int().nullable(),
      currency: z.string().length(3).nullable(),
    }),
  ),
});

export const suggestionSchema = z.object({
  label: z.string(),
  /* The filter value behind the label, identical to the matching facet option's. */
  value: z.string(),
  kind: z.enum(["country", "region", "location", "base"]),
});

/*
 * No currency. Both endpoints answer with whatever the offer publishes in: the calendar's slots
 * carry their own, and the constraint set's rate list is read as a season signal rather than a
 * price. Narrowing either to one currency emptied them for an offer that quotes in another, and
 * an empty rate list reads as season-closed on every day of the window.
 */
export const availabilityCalendarInputSchema = z
  .object({
    listingId: z.string(),
    from: dateStringSchema,
    to: dateStringSchema,
  })
  .superRefine((input, context) => {
    if (input.from >= input.to) {
      context.addIssue({
        code: "custom",
        message: "to must be after from",
        path: ["to"],
      });
    }
  });

export const availabilityCalendarSchema = z.object({
  listingId: z.string(),
  slots: z.array(
    z.object({
      startDate: z.string(),
      endDate: z.string(),
      status: z.enum(["available", "option", "occupied", "blocked"]),
      price: moneySchema.optional(),
      minNights: z.number().int().nullable(),
      checkinWeekday: z.number().int().nullable(),
      checkoutWeekday: z.number().int().nullable(),
      availabilityConfirmed: z.boolean(),
    }),
  ),
});

/** One vendor's own answer: its calendar, its rules, its rates, its refusals. */
export const offerConstraintsSchema = z.object({
  offerId: z.string(),
  provider: z.string(),
  rules: z.array(
    z.object({
      checkinWeekday: z.number().int().min(0).max(6).nullable(),
      checkoutWeekday: z.number().int().min(0).max(6).nullable(),
      minNights: z.number().int().nullable(),
      maxNights: z.number().int().nullable(),
      /* When the rule applies, judged against the check-in day and inclusive at both ends. A
         rule out of season does not admit a charter; see `rulesOn` in availability-rules.ts. */
      seasonStart: z.string().nullable(),
      seasonEnd: z.string().nullable(),
    }),
  ),
  occupied: z.array(
    z.object({
      startDate: z.string(),
      endDate: z.string(),
      status: z.enum(["option", "occupied", "blocked"]),
    }),
  ),
  priced: z.array(
    z.object({
      startDate: z.string(),
      endDate: z.string(),
      priceMinor: z.number().int(),
      currency: currencySchema,
      confirmed: z.boolean(),
    }),
  ),
  /** Exact periods this provider declined to sell; matched on both ends, never by overlap. */
  refused: z.array(z.object({ startDate: z.string(), endDate: z.string() })),
  oneWay: z.array(
    z.object({
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      isOneWay: z.boolean(),
    }),
  ),
});

/**
 * One set per offer, deliberately not flattened.
 *
 * A yacht two vendors sell has two calendars and two sets of check-in rules, and merging them
 * would describe a charter neither would honour: one vendor's free week closed on the other's
 * turnaround day. The caller combines the answers instead, so a day is offered when any offer
 * can deliver it.
 */
export const availabilityConstraintsSchema = z.object({
  listingId: z.string(),
  window: z.object({ from: z.string(), to: z.string() }),
  offers: z.array(offerConstraintsSchema),
});
