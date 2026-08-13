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
  pricingType: z.enum(["per_booking", "per_week", "pay_at_check_in"]),
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
    yearBuilt: z.number().int(),
    sailType: z.string().nullable(),
  }),
  policies: z.object({
    depositInsuranceIncluded: z.boolean(),
    petsAllowed: z.boolean(),
  }),
  availability: z.object({
    hasUnconfirmedAvailability: z.boolean(),
    hasAvailableDates: z.boolean(),
    hasTemporaryBooking: z.boolean(),
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
  priceDetails: z.object({
    periodDays: z.number().int(),
    perPersonMinor: z.number().int().nullable(),
    bookingPrepayment: moneySchema.nullable(),
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
  description: z.string(),
  overview: z.array(includedItemSchema.extend({ value: z.string() })),
  includedAmenities: z.array(includedItemSchema),
  mandatoryExtras: z.array(pricedItemSchema),
  optionalExtras: z.array(pricedItemSchema),
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
    yachtPickup: z.object({
      date: z.string().nullable(),
      time: z.string().nullable(),
    }),
    yachtDropOff: z.object({
      date: z.string().nullable(),
      time: z.string().nullable(),
    }),
    cancellationPaymentPolicies: z.string(),
    sailingLicenseRequired: z.string(),
    pets: z.string(),
    paymentMethodsAcceptedByCharterCompany: z.array(z.string()),
    marinaInformation: z.string(),
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
  suggestedRoute: z.object({
    title: z.string(),
    map: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
    stops: z.array(
      z.object({
        day: z.number().int(),
        title: z.string(),
        description: z.string(),
        lat: z.number(),
        lng: z.number(),
      }),
    ),
  }),
  reviews: z.array(reviewSchema),
  faq: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      answer: z.string(),
    }),
  ),
  popularYachts: z.array(listingSummarySchema),
});

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
  charterCompany: stringArrayParamSchema,
  marina: stringArrayParamSchema,
  boatType: stringArrayParamSchema,
  model: stringArrayParamSchema,
  crew: stringArrayParamSchema,
  mainsailType: stringArrayParamSchema,
  equipment: stringArrayParamSchema,
  startDate: dateStringSchema.optional(),
  duration: z.coerce.number().int().positive().optional(),
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

export const mapResultSchema = z.object({
  markers: z.array(
    z.object({
      listingId: z.string(),
      slug: z.string(),
      title: z.string(),
      lat: z.number(),
      lng: z.number(),
      priceFromMinor: z.number().int().nullable(),
      currency: z.string().length(3).nullable(),
      listing: listingSummarySchema,
    }),
  ),
});

export const suggestionSchema = z.object({
  label: z.string(),
  kind: z.enum(["country", "region", "location", "base"]),
});

export const availabilityCalendarInputSchema = z
  .object({
    listingId: z.string(),
    from: dateStringSchema,
    to: dateStringSchema,
    currency: currencySchema.default("EUR"),
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

export const availabilityConstraintsSchema = z.object({
  listingId: z.string(),
  window: z.object({ from: z.string(), to: z.string() }),
  rules: z.array(
    z.object({
      checkinWeekday: z.number().int().min(0).max(6).nullable(),
      checkoutWeekday: z.number().int().min(0).max(6).nullable(),
      minNights: z.number().int().nullable(),
      maxNights: z.number().int().nullable(),
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
  oneWay: z.array(
    z.object({
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      isOneWay: z.boolean(),
    }),
  ),
});
