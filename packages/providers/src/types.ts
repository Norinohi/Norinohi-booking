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
  from: z.string(),
  to: z.string(),
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

export const quoteRequestSchema = z.object({
  listingId: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.number().int().positive(),
  extras: z.array(z.string()).default([]),
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
  priceSourceHash: z.string(),
  expiresAt: z.string(),
  repriced: z.boolean(),
});
export type ProviderQuote = z.infer<typeof providerQuoteSchema>;

export const bookingDraftSchema = z.object({
  listingId: z.string(),
  quoteId: z.string(),
  customer: z.object({
    name: z.string(),
    email: z.string().email(),
  }),
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
  holdExpiresAt: z.string().optional(),
});
export type ProviderReservation = z.infer<typeof providerReservationSchema>;

export const providerExtrasMutationSchema = z.object({
  reservationId: z.string(),
  extras: z.array(z.string()),
});
export type ProviderExtrasMutation = z.infer<typeof providerExtrasMutationSchema>;

export const rawEntitySchema = z.object({
  resourceType: z.enum([
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
  ]),
  externalId: z.string(),
  payload: z.unknown(),
});
export type RawEntity = z.infer<typeof rawEntitySchema>;

export const providerCapabilitiesSchema = z.object({
  supportsOptions: z.boolean(),
  supportsWebhooks: z.boolean(),
  optionExpiryOwnedByProvider: z.boolean(),
  supportsExtrasMutation: z.boolean(),
  supportsLiveQuote: z.boolean(),
});
export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>;
