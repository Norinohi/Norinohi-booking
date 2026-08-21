import { relations } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, unique } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";

/**
 * Who wrote a translation row.
 *
 * The catalogue sync refreshes its own rows on every run so an upstream rename lands, and
 * leaves editorial ones alone. Without the distinction the two writers fight: either the
 * sync overwrites hand-written copy, or a first-write-wins guard freezes seven hundred
 * provider labels at whatever they said the day they were first imported.
 */
export const facetTranslationSource = pgEnum("facet_translation_source", ["editorial", "provider"]);

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
    /* Default-locale (en) copy. Other locales live in facet_media_translation. */
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (t) => [
    unique("facet_media_kind_value_key").on(t.kind, t.value),
    index("facet_media_kind_idx").on(t.kind),
  ],
);

/*
 * Per-locale copy for a facet value.
 *
 * `locale` is text rather than an enum so adding a language is a data change, matching
 * apps/web where a locale is added by extending i18n/config.ts and dropping in a messages
 * file. A missing row falls back to facet_media's default-locale copy, so a half-translated
 * facet degrades to English rather than to a blank card.
 *
 * `label` overrides the display name only. The facet's `value` stays derived from the
 * English label because it is what the search filters match against.
 */
export const facetMediaTranslation = pgTable(
  "facet_media_translation",
  {
    id: id("fcmt"),
    facetMediaId: text("facet_media_id")
      .notNull()
      .references(() => facetMedia.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    label: text("label"),
    description: text("description"),
    /* Existing rows are the hand-written seed, hence the default. */
    source: facetTranslationSource("source").default("editorial").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("facet_media_translation_locale_key").on(t.facetMediaId, t.locale),
    index("facet_media_translation_locale_idx").on(t.locale),
  ],
);

export const facetMediaRelations = relations(facetMedia, ({ many }) => ({
  translations: many(facetMediaTranslation),
}));

export const facetMediaTranslationRelations = relations(facetMediaTranslation, ({ one }) => ({
  media: one(facetMedia, {
    fields: [facetMediaTranslation.facetMediaId],
    references: [facetMedia.id],
  }),
}));
