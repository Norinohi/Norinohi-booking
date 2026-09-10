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
  "model",
]);

/**
 * Which curated list is being edited.
 *
 * `popular` pins values into the "Popular" group at the top of a picker; `featured` orders the
 * home page's sliders and grids. They are independent lists over the same values, because the
 * client's own two country lists are not prefixes of each other.
 *
 * `filter` is the odd one and reads as membership rather than order: it is the allowlist of
 * values the search filter offers at all, and an empty one means every value is offered. It
 * shares this contract because an editor does the same thing to it -- tick values, untick
 * values, save the whole list -- and a screen of its own would differ only in the arrows.
 */
export const popularFacetSurfaceSchema = z.enum(["popular", "featured", "filter"]);

export const popularFacetValueSchema = z.object({
  /** The filter value, identical to the matching search facet option's. */
  value: z.string(),
  label: z.string(),
  /**
   * Position in the curated list, 1-based. Null for a value that is not in it.
   *
   * On the `filter` surface there is no order to hold, so a member carries 1 and everything
   * else null: the field still answers the only question that surface asks of it, which is
   * whether the value is in the list.
   */
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
  /*
   * Wide enough for the equipment allowlist, which runs to about fifty values out of the eight
   * hundred spellings the two providers publish between them. The pinned lists use a dozen.
   */
  values: z.array(z.string().min(1)).max(200),
});

export const popularFacetSetSchema = z.object({
  kind: popularFacetKindSchema,
  surface: popularFacetSurfaceSchema,
  selected: z.array(popularFacetValueSchema),
  cache: faqCacheSchema,
});
