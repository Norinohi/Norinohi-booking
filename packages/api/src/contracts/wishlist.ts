import { z } from "zod";

import { listingSummarySchema } from "./catalog";
import { paginatedSchema, paginationInputDefault, paginationInputSchema } from "./primitives";

const DEFAULT_PAGE_SIZE = 10;

export const wishlistListInputSchema = z
  .object(paginationInputSchema({ maxPageSize: 48, defaultPageSize: DEFAULT_PAGE_SIZE }))
  .default(paginationInputDefault(DEFAULT_PAGE_SIZE));

export const wishlistEntrySchema = z.object({
  listing: listingSummarySchema,
  savedAt: z.string(),
});

export const wishlistListSchema = paginatedSchema(wishlistEntrySchema);

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
