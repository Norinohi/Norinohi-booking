import { relations } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  jsonb,
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
// Cycle with listing-text.ts is safe: both sides only dereference the other inside
// lazy relation/reference callbacks.
import { listingText } from "./listing-text";
import { listingOffer } from "./listing-offer";
import { operator } from "./operator";
import { amenity, builder, yachtCategory, yachtModel } from "./taxonomy";

/**
 * `merged` is not a withdrawal. It marks a listing whose offers all moved onto another
 * listing in a duplicate merge: it holds no inventory any more and must never be shown,
 * but it is kept rather than deleted because bookings and quotes still point at it, and
 * `merged_into_listing_id` is what lets its old URL redirect to the survivor.
 */
export const listingStatus = pgEnum("listing_status", ["draft", "published", "hidden", "merged"]);

export const mediaRole = pgEnum("media_role", ["main", "layout", "gallery"]);

const measurement = (name: string) => numeric(name, { precision: 8, scale: 2 });

export const listing = pgTable(
  "listing",
  {
    id: id("ylst"),
    slug: text("slug").notNull().unique(),
    /**
     * The boat's own name, from whichever offer won the `title` field group, with no model
     * appended. Nullable because a vendor need not give one, and because the rows that predate
     * the column were backfilled from `title` only where the model could be stripped safely.
     */
    name: text("name"),
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
    /**
     * Refundable damage deposit the base takes at check-in and returns after
     * check-out. Never collected by us, so it stays out of every total; the
     * currency is stored because NauSYS lets a deposit name one of its own,
     * distinct from the season currency in `default_currency`.
     */
    /**
     * The day the operator retires this hull. A boat past it is still in the vendor's catalogue
     * and no longer sellable, so the search document skips it rather than the sync deleting the
     * listing -- a charter already booked on it still has to be readable.
     */
    outOfFleetDate: date("out_of_fleet_date"),
    /** A walkthrough the operator filmed, and a 360 tour of the same boat. */
    videoUrl: text("video_url"),
    tourUrl: text("tour_url"),
    securityDepositMinor: integer("security_deposit_minor"),
    /**
     * What the deposit falls to when the charter carries deposit insurance, where the operator
     * publishes a second figure for it. Null means it does not change, or nobody said.
     */
    securityDepositWhenInsuredMinor: integer("security_deposit_when_insured_minor"),
    securityDepositCurrency: text("security_deposit_currency"),
    depositInsuranceIncluded: boolean("deposit_insurance_included").default(false).notNull(),
    petsAllowed: boolean("pets_allowed").default(false).notNull(),
    defaultCurrency: text("default_currency"),
    /**
     * Overrides how much is taken up front for this yacht, e.g.
     * `{ "mode": "full" }` or `{ "mode": "deposit", "depositPct": 0.3 }`.
     * Null falls through to the provider's plan, then the marketplace default —
     * §6.3 is explicit that 50/100 must never be hardcoded.
     */
    paymentPolicy: jsonb("payment_policy").$type<{
      mode: "deposit" | "full";
      depositPct?: number;
      balanceDueAt?: string;
    }>(),
    status: listingStatus("status").default("draft").notNull(),
    // Provider-side review aggregate (NauSYS ships Euminia scores). Nullable, never
    // zero-filled: a yacht nobody has rated is not a yacht rated 0.
    providerRating: numeric("provider_rating", { precision: 3, scale: 2 }),
    providerReviewCount: integer("provider_review_count"),
    // Winning listing_source for spec resolution; plain text to avoid an FK cycle.
    primarySourceId: text("primary_source_id"),
    /** Where a merged listing's offers went, so its old URL can redirect. */
    mergedIntoListingId: text("merged_into_listing_id").references((): AnyPgColumn => listing.id, {
      onDelete: "set null",
    }),
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
  /* Null when the provider states no count; a head is not necessarily a shower. */
  showers: integer("showers"),
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
    listingOfferId: text("listing_offer_id")
      .notNull()
      .references(() => listingOffer.id, { onDelete: "cascade" }),
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
  (t) => [
    index("listing_media_listing_idx").on(t.listingId),
    index("listing_media_offer_idx").on(t.listingOfferId),
  ],
);

export const listingAmenity = pgTable(
  "listing_amenity",
  {
    id: id("lamn"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    listingOfferId: text("listing_offer_id")
      .notNull()
      .references(() => listingOffer.id, { onDelete: "cascade" }),
    amenityId: text("amenity_id")
      .notNull()
      .references(() => amenity.id, { onDelete: "restrict" }),
    obligatory: boolean("obligatory").default(false).notNull(),
    ...money("price"),
    ...timestamps,
  },
  (t) => [
    unique("listing_amenity_uq").on(t.listingOfferId, t.amenityId),
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
    listingOfferId: text("listing_offer_id")
      .notNull()
      .references(() => listingOffer.id, { onDelete: "cascade" }),
    checkinWeekday: integer("checkin_weekday"),
    checkoutWeekday: integer("checkout_weekday"),
    minNights: integer("min_nights"),
    maxNights: integer("max_nights"),
    /*
     * When the rule is in force, both ends inclusive and both nullable for a provider that
     * states no season at all.
     *
     * Turnaround terms are seasonal and operators do let them lapse. Without these columns
     * every season's rule applied to every date: NauSYS yacht 29476220 carries a three-night
     * any-weekday period that expired on 04.05.2025 beside the Saturday-to-Saturday week it
     * actually sells, so the card advertised a three-night charter in September 2026 that the
     * vendor's own offers engine refused outright. Roughly a tenth of the dated cards were
     * advertising a period bought from a lapsed rule that way.
     */
    seasonStart: date("season_start"),
    seasonEnd: date("season_end"),
    ...timestamps,
  },
  (t) => [
    index("listing_checkin_rule_listing_idx").on(t.listingId),
    index("listing_checkin_rule_offer_idx").on(t.listingOfferId),
  ],
);

export const listingOneWayRule = pgTable(
  "listing_one_way_rule",
  {
    id: id("lowr"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    listingOfferId: text("listing_offer_id")
      .notNull()
      .references(() => listingOffer.id, { onDelete: "cascade" }),
    startDate: date("start_date"),
    endDate: date("end_date"),
    isOneWay: boolean("is_one_way").default(true).notNull(),
    ...timestamps,
  },
  (t) => [
    index("listing_one_way_rule_listing_idx").on(t.listingId),
    index("listing_one_way_rule_offer_idx").on(t.listingOfferId),
  ],
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
  texts: many(listingText),
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
