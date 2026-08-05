import { relations } from "drizzle-orm";
import { doublePrecision, index, pgTable, text } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";

export const country = pgTable(
  "country",
  {
    id: id("cty"),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [index("country_code_idx").on(t.code)],
);

export const region = pgTable(
  "region",
  {
    id: id("rgn"),
    countryId: text("country_id")
      .notNull()
      .references(() => country.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [index("region_country_idx").on(t.countryId)],
);

export const location = pgTable(
  "location",
  {
    id: id("loc"),
    regionId: text("region_id")
      .notNull()
      .references(() => region.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [index("location_region_idx").on(t.regionId)],
);

export const base = pgTable(
  "base",
  {
    id: id("base"),
    locationId: text("location_id")
      .notNull()
      .references(() => location.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    email: text("email"),
    phone: text("phone"),
    website: text("website"),
    checkInTime: text("check_in_time"),
    checkOutTime: text("check_out_time"),
    ...timestamps,
  },
  (t) => [index("base_location_idx").on(t.locationId)],
);

export const countryRelations = relations(country, ({ many }) => ({
  regions: many(region),
}));

export const regionRelations = relations(region, ({ one, many }) => ({
  country: one(country, {
    fields: [region.countryId],
    references: [country.id],
  }),
  locations: many(location),
}));

export const locationRelations = relations(location, ({ one, many }) => ({
  region: one(region, {
    fields: [location.regionId],
    references: [region.id],
  }),
  bases: many(base),
}));

export const baseRelations = relations(base, ({ one }) => ({
  location: one(location, {
    fields: [base.locationId],
    references: [location.id],
  }),
}));
