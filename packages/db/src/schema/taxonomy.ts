import { relations, sql } from "drizzle-orm";
import { boolean, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";

export const builder = pgTable(
  "builder",
  {
    id: id("bld"),
    name: text("name").notNull(),
    slug: text("slug").unique(),
    ...timestamps,
  },
  (t) => [index("builder_name_idx").on(t.name)],
);

export const yachtModel = pgTable(
  "yacht_model",
  {
    id: id("mdl"),
    builderId: text("builder_id").references(() => builder.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    ...timestamps,
  },
  /*
   * `(builder_id, name)` is the natural key the catalogue writer resolves by, and
   * it carries more weight than the other taxonomy keys: cross-provider duplicate
   * detection joins listings on `model_id`, so a race that splits one model into
   * two rows means the duplicate is never proposed and the review queue looks
   * clean rather than broken.
   *
   * Two indexes because `builder_id` is nullable and Postgres treats NULLs as
   * distinct, so the composite alone would let unattributed models duplicate
   * freely.
   */
  (t) => [
    index("yacht_model_builder_idx").on(t.builderId),
    uniqueIndex("yacht_model_builder_name_uq").on(t.builderId, t.name),
    uniqueIndex("yacht_model_name_no_builder_uq")
      .on(t.name)
      .where(sql`${t.builderId} is null`),
  ],
);

export const yachtCategory = pgTable(
  "yacht_category",
  {
    id: id("cat"),
    code: text("code").unique(),
    name: text("name").notNull(),
    /*
     * The category the marketplace groups this one under — several vendor categories
     * share one. `name` stays the operator's own wording for the listing page; search
     * and facets read the group, so near-synonyms do not each become a facet. Null
     * for a category the provider package has not classified, which then groups
     * under its own name.
     */
    canonicalName: text("canonical_name"),
    ...timestamps,
  },
  (t) => [
    index("yacht_category_name_idx").on(t.name),
    index("yacht_category_canonical_name_idx").on(t.canonicalName),
  ],
);

export const amenityCategory = pgTable(
  "amenity_category",
  {
    id: id("amc"),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("amenity_category_name_uq").on(t.name)],
);

export const amenity = pgTable(
  "amenity",
  {
    id: id("amn"),
    amenityCategoryId: text("amenity_category_id")
      .notNull()
      .references(() => amenityCategory.id, { onDelete: "restrict" }),
    code: text("code").unique(),
    name: text("name").notNull(),
    // A crew role rather than a thing aboard. Priced like any other extra, but the
    // booking sidebar offers it through the Crew control instead of the extras
    // list, and `quote.crew_type` decides which of them a quote includes.
    crew: boolean("crew").default(false).notNull(),
    ...timestamps,
  },
  (t) => [index("amenity_category_idx").on(t.amenityCategoryId)],
);

export const builderRelations = relations(builder, ({ many }) => ({
  models: many(yachtModel),
}));

export const yachtModelRelations = relations(yachtModel, ({ one }) => ({
  builder: one(builder, {
    fields: [yachtModel.builderId],
    references: [builder.id],
  }),
}));

export const amenityCategoryRelations = relations(amenityCategory, ({ many }) => ({
  amenities: many(amenity),
}));

export const amenityRelations = relations(amenity, ({ one }) => ({
  category: one(amenityCategory, {
    fields: [amenity.amenityCategoryId],
    references: [amenityCategory.id],
  }),
}));
