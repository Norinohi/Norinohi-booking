import { relations } from "drizzle-orm";
import { index, pgTable, text } from "drizzle-orm/pg-core";

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
  (t) => [index("yacht_model_builder_idx").on(t.builderId)],
);

export const yachtCategory = pgTable(
  "yacht_category",
  {
    id: id("cat"),
    code: text("code").unique(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [index("yacht_category_name_idx").on(t.name)],
);

export const amenityCategory = pgTable("amenity_category", {
  id: id("amc"),
  name: text("name").notNull(),
  ...timestamps,
});

export const amenity = pgTable(
  "amenity",
  {
    id: id("amn"),
    amenityCategoryId: text("amenity_category_id")
      .notNull()
      .references(() => amenityCategory.id, { onDelete: "restrict" }),
    code: text("code").unique(),
    name: text("name").notNull(),
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

export const amenityCategoryRelations = relations(
  amenityCategory,
  ({ many }) => ({
    amenities: many(amenity),
  }),
);

export const amenityRelations = relations(amenity, ({ one }) => ({
  category: one(amenityCategory, {
    fields: [amenity.amenityCategoryId],
    references: [amenityCategory.id],
  }),
}));
