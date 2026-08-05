import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { id, money, timestamps } from "./_shared";
import { base } from "./geography";
import { operator } from "./operator";
import { amenity, builder, yachtCategory, yachtModel } from "./taxonomy";

export const listingStatus = pgEnum("listing_status", ["draft", "published", "hidden"]);

export const mediaRole = pgEnum("media_role", ["main", "layout", "gallery"]);

const measurement = (name: string) => numeric(name, { precision: 8, scale: 2 });

export const listing = pgTable(
  "listing",
  {
    id: id("ylst"),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    operatorId: text("operator_id")
      .notNull()
      .references(() => operator.id, { onDelete: "restrict" }),
    homeBaseId: text("home_base_id")
      .notNull()
      .references(() => base.id, { onDelete: "restrict" }),
    builderId: text("builder_id").references(() => builder.id, {
      onDelete: "set null",
    }),
    modelId: text("model_id").references(() => yachtModel.id, {
      onDelete: "set null",
    }),
    categoryId: text("category_id").references(() => yachtCategory.id, {
      onDelete: "set null",
    }),
    crewType: text("crew_type"),
    depositInsuranceIncluded: boolean("deposit_insurance_included").default(false).notNull(),
    petsAllowed: boolean("pets_allowed").default(false).notNull(),
    defaultCurrency: text("default_currency"),
    status: listingStatus("status").default("draft").notNull(),
    // Winning listing_source for spec resolution; plain text to avoid an FK cycle.
    primarySourceId: text("primary_source_id"),
    freshnessAt: timestamp("freshness_at"),
    ...timestamps,
  },
  (t) => [
    index("listing_slug_idx").on(t.slug),
    index("listing_operator_idx").on(t.operatorId),
    index("listing_home_base_idx").on(t.homeBaseId),
  ],
);

export const listingSpecification = pgTable("listing_specification", {
  id: id("lspec"),
  listingId: text("listing_id")
    .notNull()
    .unique()
    .references(() => listing.id, { onDelete: "cascade" }),
  lengthM: measurement("length_m"),
  beamM: measurement("beam_m"),
  draftM: measurement("draft_m"),
  yearBuilt: integer("year_built"),
  cabins: integer("cabins"),
  berths: integer("berths"),
  heads: integer("heads"),
  engines: integer("engines"),
  enginePower: text("engine_power"),
  fuelType: text("fuel_type"),
  fuelCapacity: integer("fuel_capacity"),
  waterCapacity: integer("water_capacity"),
  propulsionType: text("propulsion_type"),
  steeringType: text("steering_type"),
  sailType: text("sail_type"),
  ...timestamps,
});

export const listingMedia = pgTable(
  "listing_media",
  {
    id: id("lmed"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    source: text("source"),
    externalUrl: text("external_url").notNull(),
    role: mediaRole("role").default("gallery").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    width: integer("width"),
    height: integer("height"),
    cloudinaryId: text("cloudinary_id"),
    importedAt: timestamp("imported_at"),
    ...timestamps,
  },
  (t) => [index("listing_media_listing_idx").on(t.listingId)],
);

export const listingAmenity = pgTable(
  "listing_amenity",
  {
    id: id("lamn"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    amenityId: text("amenity_id")
      .notNull()
      .references(() => amenity.id, { onDelete: "restrict" }),
    obligatory: boolean("obligatory").default(false).notNull(),
    ...money("price"),
    ...timestamps,
  },
  (t) => [
    unique("listing_amenity_uq").on(t.listingId, t.amenityId),
    index("listing_amenity_listing_idx").on(t.listingId),
  ],
);

export const listingCheckinRule = pgTable(
  "listing_checkin_rule",
  {
    id: id("lcir"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    checkinWeekday: integer("checkin_weekday"),
    checkoutWeekday: integer("checkout_weekday"),
    minNights: integer("min_nights"),
    maxNights: integer("max_nights"),
    ...timestamps,
  },
  (t) => [index("listing_checkin_rule_listing_idx").on(t.listingId)],
);

export const listingOneWayRule = pgTable(
  "listing_one_way_rule",
  {
    id: id("lowr"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    startDate: date("start_date"),
    endDate: date("end_date"),
    isOneWay: boolean("is_one_way").default(true).notNull(),
    ...timestamps,
  },
  (t) => [index("listing_one_way_rule_listing_idx").on(t.listingId)],
);

export const listingRelations = relations(listing, ({ one, many }) => ({
  operator: one(operator, {
    fields: [listing.operatorId],
    references: [operator.id],
  }),
  homeBase: one(base, {
    fields: [listing.homeBaseId],
    references: [base.id],
  }),
  builder: one(builder, {
    fields: [listing.builderId],
    references: [builder.id],
  }),
  model: one(yachtModel, {
    fields: [listing.modelId],
    references: [yachtModel.id],
  }),
  category: one(yachtCategory, {
    fields: [listing.categoryId],
    references: [yachtCategory.id],
  }),
  specification: one(listingSpecification),
  media: many(listingMedia),
  amenities: many(listingAmenity),
  checkinRules: many(listingCheckinRule),
  oneWayRules: many(listingOneWayRule),
}));

export const listingSpecificationRelations = relations(listingSpecification, ({ one }) => ({
  listing: one(listing, {
    fields: [listingSpecification.listingId],
    references: [listing.id],
  }),
}));

export const listingMediaRelations = relations(listingMedia, ({ one }) => ({
  listing: one(listing, {
    fields: [listingMedia.listingId],
    references: [listing.id],
  }),
}));

export const listingAmenityRelations = relations(listingAmenity, ({ one }) => ({
  listing: one(listing, {
    fields: [listingAmenity.listingId],
    references: [listing.id],
  }),
  amenity: one(amenity, {
    fields: [listingAmenity.amenityId],
    references: [amenity.id],
  }),
}));

export const listingCheckinRuleRelations = relations(listingCheckinRule, ({ one }) => ({
  listing: one(listing, {
    fields: [listingCheckinRule.listingId],
    references: [listing.id],
  }),
}));

export const listingOneWayRuleRelations = relations(listingOneWayRule, ({ one }) => ({
  listing: one(listing, {
    fields: [listingOneWayRule.listingId],
    references: [listing.id],
  }),
}));
