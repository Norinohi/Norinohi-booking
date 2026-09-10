import { z } from "zod";

import { faqCacheSchema } from "./faq";

/**
 * The facet groups a value can be curated in, matching the `facet_media_kind` enum.
 *
 * Restated here rather than derived from the Drizzle enum because this is the contract the
 * browser sees: a kind added to the schema should be a deliberate addition to the admin screen,
 * not one that appears in a picker the moment a migration lands.
 */
export const popularFacetKindSchema = z.enum([
  "country",
  "region",
  "location",
  "marina",
  "category",
  "crew",
  "sail_type",
  "equipment",
]);

/**
 * Which of the two curated orders is being edited.
 *
 * `popular` pins values into the "Popular" group at the top of a picker; `featured` orders the
 * home page's sliders and grids. They are independent lists over the same values, because the
 * client's own two country lists are not prefixes of each other.
 */
export const popularFacetSurfaceSchema = z.enum(["popular", "featured"]);

export const popularFacetValueSchema = z.object({
  /** The filter value, identical to the matching search facet option's. */
  value: z.string(),
  label: z.string(),
  /** Position in the curated list, 1-based. Null for a value that is not in it. */
  rank: z.number().int().positive().nullable(),
  /**
   * How many listings currently carry this value, or null when nothing does. A curated value
   * counting nothing is worth showing rather than hiding: it is either a spelling the catalogue
   * has stopped using or a country we no longer sell, and both want an editor's attention.
   */
  count: z.number().int().nonnegative().nullable(),
  imageUrl: z.string().nullable(),
  cloudinaryId: z.string().nullable(),
});

export const popularFacetListInputSchema = z.object({
  kind: popularFacetKindSchema,
  surface: popularFacetSurfaceSchema,
  /** Which language the labels come back in. Does not affect what is selectable. */
  locale: z.string().min(2).max(10).optional(),
});

export const popularFacetListSchema = z.object({
  kind: popularFacetKindSchema,
  surface: popularFacetSurfaceSchema,
  /** The curated list, in rank order. */
  selected: z.array(popularFacetValueSchema),
  /** Everything that could be curated, label-ascending. Includes what is already selected. */
  available: z.array(popularFacetValueSchema),
});

/**
 * The whole ordered list, replacing whatever was there.
 *
 * One idempotent write rather than the create/update/delete/reorder the FAQ screen uses,
 * because there is nothing here to create or destroy: the row for a facet value already exists
 * (or is a trivial upsert) and only its rank moves. A multiselect plus a pair of arrows *is*
 * "the whole ordered list", so saying so once is both the honest contract and the only shape
 * that cannot leave two values holding the same rank.
 */
export const popularFacetSetInputSchema = z.object({
  kind: popularFacetKindSchema,
  surface: popularFacetSurfaceSchema,
  values: z.array(z.string().min(1)).max(50),
});

export const popularFacetSetSchema = z.object({
  kind: popularFacetKindSchema,
  surface: popularFacetSurfaceSchema,
  selected: z.array(popularFacetValueSchema),
  cache: faqCacheSchema,
});
