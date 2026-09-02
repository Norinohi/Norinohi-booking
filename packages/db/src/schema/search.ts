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
    /* The boat's own name, without the model. See `listing.name`. */
    name: text("name"),
    title: text("title").notNull(),
    category: text("category"),
    crewType: text("crew_type"),
    builder: text("builder"),
    model: text("model"),
    /* The model without its cabin configuration — what model pages and grouping read. */
    modelCanonical: text("model_canonical"),
    operator: text("operator").notNull(),
    /* Denormalised from `operator.terms_and_conditions`; see the column there. */
    operatorTermsAndConditions: text("operator_terms_and_conditions"),
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
    /**
     * The largest party this listing can actually be sold to: its berths, less whatever a
     * vendor has refused. Filtered on instead of `berths`, so a family of nine stops being
     * shown a boat whose operator will not take nine.
     */
    maxGuests: integer("max_guests"),
    securityDepositMinor: integer("security_deposit_minor"),
    securityDepositCurrency: text("security_deposit_currency"),
    /* The reduced deposit a guest who buys the damage waiver leaves instead. See `listing`. */
    securityDepositWhenInsuredMinor: integer("security_deposit_when_insured_minor"),
    depositInsuranceIncluded: boolean("deposit_insurance_included").default(false).notNull(),
    petsAllowed: boolean("pets_allowed").default(false).notNull(),
    rating: numeric("rating", { precision: 3, scale: 2 }).notNull(),
    reviewCount: integer("review_count").default(0).notNull(),
    mainImage: text("main_image"),
    gallery: jsonb("gallery").$type<string[]>().default([]).notNull(),
    amenities: jsonb("amenities").$type<string[]>().default([]).notNull(),
    priceFromMinor: integer("price_from_minor"),
    /**
     * Whether `price_from_minor` prices the advertised charter or merely starts from the
     * season, which is what decides how the card captions it.
     *
     * False only where the vendor priced this exact charter. True is the cheapest week the
     * operator publishes for the season ahead, which says nothing about the dates beside it and
     * must read "From" rather than "Price for N days" -- the caption is the whole difference
     * between an indicative floor and a quote the card is promising.
     */
    priceIsFrom: boolean("price_is_from").default(false).notNull(),
    /**
     * What the advertised charter would cost without the operator's discount, all-in on the
     * same terms as `price_from_minor`, so the card can strike one figure through beside the
     * other.
     *
     * Always above `price_from_minor` when set, and null whenever it is not the vendor's own
     * arithmetic: no confirmed price, no published list price, or a difference its discounts
     * do not account for. Deliberately not converted or indexed -- it is decoration on a card,
     * never something the catalogue sorts, filters or compares on.
     */
    listPriceFromMinor: integer("list_price_from_minor"),
    currency: text("currency"),
    /**
     * `price_from_minor` converted into the one currency the catalogue compares in, and never
     * shown to anyone.
     *
     * The pair above is the provider's published price and is what a card renders. This is the
     * only column the price filter, the price sort and every "from" aggregate may touch: those
     * read across the whole catalogue, where a dollar integer and a euro integer were being
     * compared as if they were the same number.
     *
     * Null when the amount is null, and also when no rate fresh enough to trust covers its
     * currency (packages/db/src/fx/rates.ts). Null means "not comparable", so such a listing
     * keeps its own price on its card and falls out of ordering and filtering rather than
     * ranking against a number it does not share units with.
     *
     * Written by the projection, so it is as fresh as that listing's last rebuild rather than
     * as fresh as the rate. Good enough for ordering; `pnpm --filter server rebuild:search-docs`
     * reprices the fleet when it matters.
     */
    priceFromMinorEur: integer("price_from_minor_eur"),
    /**
     * The offer the card's price, dates and terms describe, and the one a quote should be
     * asked of first.
     *
     * Plain text rather than a foreign key: this table is a projection rebuilt wholesale, and
     * a reference into it would make dropping an offer a cascade through the read model. The
     * verify script checks that it names a live offer of this listing.
     */
    bestOfferId: text("best_offer_id"),
    /** How many vendors sell this hull, so a merged card can be told from a single-source one. */
    offerCount: integer("offer_count").default(0).notNull(),
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
    index("listing_search_doc_price_eur_idx").on(t.priceFromMinorEur),
    index("listing_search_doc_rating_idx").on(t.rating),
    index("listing_search_doc_available_idx").on(t.availableFrom, t.availableTo),
    index("listing_search_doc_rating_cursor_idx").on(t.rating.desc(), t.listingId.desc()),
    /* Keyed on the comparable column, because that is what the price sort orders by. */
    index("listing_search_doc_price_cursor_idx").on(
      sql`coalesce(${t.priceFromMinorEur}, 2147483647)`,
      t.listingId,
    ),
    index("listing_search_doc_price_desc_cursor_idx").on(
      sql`coalesce(${t.priceFromMinorEur}, -1) desc`,
      t.listingId.desc(),
    ),
    index("listing_search_doc_year_cursor_idx").on(
      sql`coalesce(${t.yearBuilt}, 0) desc`,
      t.listingId.desc(),
    ),
  ],
);
