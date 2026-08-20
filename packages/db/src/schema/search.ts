import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { timestamps } from "./_shared";
import { listing } from "./listing";

export const listingSearchDoc = pgTable(
  "listing_search_doc",
  {
    listingId: text("listing_id")
      .primaryKey()
      .references(() => listing.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    category: text("category"),
    crewType: text("crew_type"),
    builder: text("builder"),
    model: text("model"),
    /* The model without its cabin configuration — what model pages and grouping read. */
    modelCanonical: text("model_canonical"),
    operator: text("operator").notNull(),
    baseId: text("base_id").notNull(),
    baseName: text("base_name").notNull(),
    /* The town, which the vendors do not model — see `base.city`. Null until its base is mapped. */
    city: text("city"),
    location: text("location").notNull(),
    region: text("region").notNull(),
    country: text("country").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    baseEmail: text("base_email"),
    basePhone: text("base_phone"),
    baseWebsite: text("base_website"),
    /*
     * Wall-clock at the marina, exactly as the provider states it, never an instant. "17:00"
     * means 17:00 where the boat is, so it is carried as text and rendered without conversion:
     * turning it into a timestamp would need an IANA zone per base, which no provider sends.
     */
    baseCheckInTime: text("base_check_in_time"),
    baseCheckOutTime: text("base_check_out_time"),
    lengthM: numeric("length_m", { precision: 8, scale: 2 }),
    cabins: integer("cabins"),
    berths: integer("berths"),
    heads: integer("heads"),
    showers: integer("showers"),
    yearBuilt: integer("year_built"),
    sailType: text("sail_type"),
    securityDepositMinor: integer("security_deposit_minor"),
    securityDepositCurrency: text("security_deposit_currency"),
    depositInsuranceIncluded: boolean("deposit_insurance_included").default(false).notNull(),
    petsAllowed: boolean("pets_allowed").default(false).notNull(),
    rating: numeric("rating", { precision: 3, scale: 2 }).notNull(),
    reviewCount: integer("review_count").default(0).notNull(),
    mainImage: text("main_image"),
    gallery: jsonb("gallery").$type<string[]>().default([]).notNull(),
    amenities: jsonb("amenities").$type<string[]>().default([]).notNull(),
    priceFromMinor: integer("price_from_minor"),
    currency: text("currency"),
    availableFrom: date("available_from"),
    availableTo: date("available_to"),
    /**
     * The first charter this listing would actually sell, as both its ends.
     *
     * `available_from` is neither of these -- it is the first day nothing is sold, which for
     * most of the fleet is today and for a Saturday-to-Saturday boat is never a day you could
     * board on. A start day alone was not enough either: on its own it proves no legal
     * check-out follows, so an undated card offered dates the detail page then refused. The
     * pair is written together and read together; neither half means anything alone.
     *
     * Computed against the clock, so it is only as fresh as the last projection run (hourly,
     * with the availability sync). Readers drop a period that has fallen into the past.
     */
    bookableFrom: date("bookable_from"),
    bookableTo: date("bookable_to"),
    hasUnconfirmedAvailability: boolean("has_unconfirmed_availability").default(false).notNull(),
    hasTemporaryBooking: boolean("has_temporary_booking").default(false).notNull(),
    searchableText: text("searchable_text").notNull(),
    ...timestamps,
  },
  (t) => [
    index("listing_search_doc_slug_idx").on(t.slug),
    index("listing_search_doc_country_idx").on(t.country),
    index("listing_search_doc_region_idx").on(t.region),
    index("listing_search_doc_location_idx").on(t.location),
    /* Both back the generated facet pages, which group and filter on exactly these two. */
    index("listing_search_doc_city_idx").on(t.city),
    index("listing_search_doc_model_canonical_idx").on(t.modelCanonical),
    index("listing_search_doc_category_idx").on(t.category),
    index("listing_search_doc_crew_idx").on(t.crewType),
    index("listing_search_doc_sail_type_idx").on(t.sailType),
    index("listing_search_doc_deposit_insurance_idx").on(t.depositInsuranceIncluded),
    index("listing_search_doc_pets_idx").on(t.petsAllowed),
    index("listing_search_doc_availability_state_idx").on(
      t.hasUnconfirmedAvailability,
      t.hasTemporaryBooking,
    ),
    index("listing_search_doc_price_idx").on(t.priceFromMinor),
    index("listing_search_doc_rating_idx").on(t.rating),
    index("listing_search_doc_available_idx").on(t.availableFrom, t.availableTo),
    index("listing_search_doc_rating_cursor_idx").on(t.rating.desc(), t.listingId.desc()),
    index("listing_search_doc_price_cursor_idx").on(
      sql`coalesce(${t.priceFromMinor}, 2147483647)`,
      t.listingId,
    ),
    index("listing_search_doc_price_desc_cursor_idx").on(
      sql`coalesce(${t.priceFromMinor}, -1) desc`,
      t.listingId.desc(),
    ),
    index("listing_search_doc_year_cursor_idx").on(
      sql`coalesce(${t.yearBuilt}, 0) desc`,
      t.listingId.desc(),
    ),
  ],
);
