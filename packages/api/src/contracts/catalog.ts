import { z } from "zod";

export const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().length(3),
});

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
  mainImage: z.string(),
  gallery: z.array(z.string()),
  amenities: z.array(z.string()),
  priceFrom: moneySchema,
});

export const listingSearchInputSchema = z.object({
  destination: z.string().optional(),
  query: z.string().optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  guests: z.coerce.number().int().positive().optional(),
  category: z.string().optional(),
  minCabins: z.coerce.number().int().positive().optional(),
  maxPriceMinor: z.coerce.number().int().positive().optional(),
  currency: z.string().length(3).default("EUR"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional(),
  sort: z
    .enum(["recommended", "price-asc", "price-desc", "rating", "newest"])
    .default("recommended"),
});

export const searchResultSchema = z.object({
  items: z.array(
    z.object({
      listing: listingSummarySchema,
      checkIn: z.string().nullable(),
      checkOut: z.string().nullable(),
    }),
  ),
  nextCursor: z.string().optional(),
  pagination: z
    .object({
      page: z.number().int(),
      pageSize: z.number().int(),
      totalItems: z.number().int(),
      totalPages: z.number().int(),
      startItem: z.number().int(),
      endItem: z.number().int(),
      hasPreviousPage: z.boolean(),
      hasNextPage: z.boolean(),
    })
    .optional(),
});

export const facetsSchema = z.object({
  destinations: z.array(z.string()),
  categories: z.array(z.string()),
  amenities: z.array(z.string()),
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
    }),
  ),
});

export const suggestionSchema = z.object({
  label: z.string(),
  kind: z.enum(["country", "region", "location", "base"]),
});

export const availabilityCalendarInputSchema = z.object({
  listingId: z.string(),
  from: z.string(),
  to: z.string(),
  currency: z.string().length(3).default("EUR"),
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
    }),
  ),
});
