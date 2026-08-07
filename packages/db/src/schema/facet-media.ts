import { index, integer, pgEnum, pgTable, text, unique } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";

export const facetMediaKind = pgEnum("facet_media_kind", [
  "country",
  "region",
  "location",
  "marina",
  "category",
  "crew",
  "sail_type",
  "equipment",
]);

/*
 * Editorial image + copy for a search facet value.
 *
 * Facets are grouped off the denormalized labels in listing_search_doc, not off the
 * taxonomy tables, so this is keyed by (kind, value) rather than by a foreign key —
 * the same reason a value can be present here before any listing carries it. The join
 * normalizes both sides, so `value` may be written as "Sailing yacht" or "sailing-yacht".
 */
export const facetMedia = pgTable(
  "facet_media",
  {
    id: id("fcm"),
    kind: facetMediaKind("kind").notNull(),
    value: text("value").notNull(),
    /* Mirrors listing_media: cloudinaryId wins when set, imageUrl covers local assets. */
    imageUrl: text("image_url"),
    cloudinaryId: text("cloudinary_id"),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (t) => [
    unique("facet_media_kind_value_key").on(t.kind, t.value),
    index("facet_media_kind_idx").on(t.kind),
  ],
);
