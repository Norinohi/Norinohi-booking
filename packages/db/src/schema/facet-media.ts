import { relations, sql } from "drizzle-orm";
import { boolean, index, integer, pgEnum, pgTable, text, unique } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";

/**
 * Who wrote a translation row.
 *
 * The catalogue sync refreshes its own rows on every run so an upstream rename lands, and
 * leaves editorial ones alone. Without the distinction the two writers fight: either the
 * sync overwrites hand-written copy, or a first-write-wins guard freezes seven hundred
 * provider labels at whatever they said the day they were first imported.
 *
 * `generated` is the third case and the reason this is an enum rather than a boolean:
 * Ukrainian has no provider behind it at all, so its labels are produced rather than sourced.
 * Marking them says so — they are the rows to re-run when the vocabulary is reviewed, and the
 * rows a real vendor translation should be allowed to replace.
 */
export const facetTranslationSource = pgEnum("facet_translation_source", [
  "editorial",
  "provider",
  "generated",
]);

export const facetMediaKind = pgEnum("facet_media_kind", [
  "country",
  "region",
  "location",
  "marina",
  "category",
  "crew",
  "sail_type",
  "equipment",
  /* Boat model, which the facet derives as `coalesce(model, builder)` -- so a value here may
     name a model ("Sun Odyssey 380") or, for a hull with no model recorded, a builder. */
  "model",
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
    /*
     * The two curated orders. `popular_rank` pins a value to the top of a picker — the
     * "Popular countries" group above the full list — and `featured_rank` orders the
     * homepage sliders and grids. Both null means the value is neither.
     *
     * Two columns rather than one ranked list with a limit because the client's two lists
     * are not prefixes of each other: the filter pins eight countries ending in Seychelles
     * and Thailand, the homepage runs to twelve and takes France and the Caribbean at
     * seven and eight. Taking the first eight of the longer list would pin the wrong four.
     *
     * These are the read columns. `sort_order` above predates them and nothing queries it.
     */
    popularRank: integer("popular_rank"),
    featuredRank: integer("featured_rank"),
    /*
     * Whether the search filter offers this value at all.
     *
     * An allowlist, and an opt-in one: while no row of a kind is marked, the filter offers
     * every value the catalogue carries, which is what it did before this column existed. Mark
     * one and the kind is curated from then on: only marked values appear. Equipment is the
     * kind that needs it: the two providers publish 844 amenity spellings between them, of
     * which about fifty are worth filtering by and the rest are bilge pump handles.
     *
     * Membership only, deliberately not a rank. The filter lists its options alphabetically and
     * `popular_rank` above already pins the few that head that list, so a second order here
     * would order nothing.
     */
    filterVisible: boolean("filter_visible").default(false).notNull(),
    ...timestamps,
  },
  (t) => [
    unique("facet_media_kind_value_key").on(t.kind, t.value),
    index("facet_media_kind_idx").on(t.kind),
    /*
     * Partial, so the index holds only the handful of curated rows rather than a null per
     * facet value. Not unique: a rank is unique because the writer rewrites the whole
     * ordered list in one statement, and a non-alphabetical unique constraint is the thing
     * that breaks db:push on this schema (packages/db/AGENTS.md).
     */
    index("facet_media_popular_idx")
      .on(t.kind, t.popularRank)
      .where(sql`popular_rank is not null`),
    index("facet_media_featured_idx")
      .on(t.kind, t.featuredRank)
      .where(sql`featured_rank is not null`),
    /* Partial for the same reason: the allowlisted rows are a small slice of the table, and
       every read of this column asks for exactly that slice. */
    index("facet_media_filter_idx")
      .on(t.kind)
      .where(sql`filter_visible`),
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
