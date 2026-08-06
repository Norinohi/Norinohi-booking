import { z } from "zod";

import { listingSummarySchema, paginationSchema } from "./catalog";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

export const wishlistListInputSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
    pageSize: z.coerce.number().int().min(1).max(48).default(DEFAULT_PAGE_SIZE),
  })
  // Restated rather than `{}` — z.default() must satisfy the schema's output type.
  .default({ page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE });

export const wishlistEntrySchema = z.object({
  listing: listingSummarySchema,
  savedAt: z.string(),
});

export const wishlistListSchema = z.object({
  items: z.array(wishlistEntrySchema),
  pagination: paginationSchema,
});

export const wishlistToggleInputSchema = z.object({
  listingId: z.string().min(1),
});

/**
 * Deliberately narrow: the Boat Card bookmark only needs its own state back, so a
 * toggle does not pay for re-serialising the whole wishlist.
 */
export const wishlistToggleSchema = z.object({
  listingId: z.string(),
  saved: z.boolean(),
  savedAt: z.string().nullable(),
});

export const wishlistIdsSchema = z.object({
  listingIds: z.array(z.string()),
});
