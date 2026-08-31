import { boolean, date, index, integer, pgEnum, pgTable, text, unique } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { listing } from "./listing";
import { listingOffer } from "./listing-offer";
import { listingSource } from "./listing-source";

export const availabilitySlotStatus = pgEnum("availability_slot_status", [
  "available",
  "option",
  "occupied",
  "blocked",
]);

export const availabilitySlot = pgTable(
  "availability_slot",
  {
    id: id("avsl"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    listingSourceId: text("listing_source_id").references(() => listingSource.id, {
      onDelete: "set null",
    }),
    listingOfferId: text("listing_offer_id")
      .notNull()
      .references(() => listingOffer.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: availabilitySlotStatus("status").notNull(),
    availabilityConfirmed: boolean("availability_confirmed").default(true).notNull(),
    priceMinor: integer("price_minor"),
    /**
     * The unavoidable extras the provider quoted alongside `price_minor` for this exact period.
     *
     * Only a confirmed offer carries one, and it is the number the search card adds to the rate:
     * the catalogue prices the same fees as a ladder across season, length, party size, base and
     * route, and reassembling it there guessed wrong twice before this column existed.
     */
    obligatoryExtrasMinor: integer("obligatory_extras_minor"),
    currency: text("currency"),
    minNights: integer("min_nights"),
    checkinWeekday: integer("checkin_weekday"),
    checkoutWeekday: integer("checkout_weekday"),
    sourceHash: text("source_hash"),
    ...timestamps,
  },
  (t) => [
    unique("availability_slot_period_uq").on(t.listingOfferId, t.startDate, t.endDate),
    index("availability_slot_listing_idx").on(t.listingId),
    index("availability_slot_dates_idx").on(t.startDate, t.endDate),
  ],
);

export const pricePeriodKind = pgEnum("price_period_kind", ["weekly", "daily"]);

/**
 * The provider's published rates, as the periods it published them for.
 *
 * Before this table the card's "from" price was a by-product of the synthesized slot list:
 * the cheapest enumerated week. That made the price depend on how we cut the calendar, and
 * left a listing priceless wherever the cut missed. A rate is the provider's own statement
 * about a date range, so it is stored as one.
 *
 * `kind` matters and must not be flattened: a weekly rate is not seven daily rates, and
 * NauSYS publishes the two in separate lists.
 */
export const listingPricePeriod = pgTable(
  "listing_price_period",
  {
    id: id("lpp"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    listingSourceId: text("listing_source_id").references(() => listingSource.id, {
      onDelete: "set null",
    }),
    listingOfferId: text("listing_offer_id")
      .notNull()
      .references(() => listingOffer.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    kind: pricePeriodKind("kind").notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("listing_price_period_uq").on(t.listingOfferId, t.kind, t.startDate, t.endDate),
    index("listing_price_period_listing_idx").on(t.listingId),
    index("listing_price_period_dates_idx").on(t.startDate, t.endDate),
  ],
);

/**
 * Stretches with nothing booked in them, as the complement of occupancy.
 *
 * Distinct from a synthesized `availability_slot`, which asserted a *charter*: a start day, a
 * length, a price. This asserts only that the provider has sold nothing between two dates,
 * which is derived from a fact rather than from a reading of the check-in rule. Whether a
 * given charter fits inside one is decided later, against the rules.
 *
 * Only written for a year whose occupancy dump arrived whole. A row here for a year we never
 * fetched would advertise a boat as free on the strength of not having looked.
 */
export const listingFreePeriod = pgTable(
  "listing_free_period",
  {
    id: id("lfp"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    listingSourceId: text("listing_source_id").references(() => listingSource.id, {
      onDelete: "set null",
    }),
    listingOfferId: text("listing_offer_id")
      .notNull()
      .references(() => listingOffer.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("listing_free_period_uq").on(t.listingOfferId, t.startDate, t.endDate),
    /*
     * Containment (`start <= checkIn and end >= checkOut`) is a range scan on this index. A
     * `daterange` with GiST would be the textbook answer and is worth revisiting at a fleet
     * size where this stops being an index probe over a handful of rows per listing.
     */
    index("listing_free_period_lookup_idx").on(t.listingId, t.startDate, t.endDate),
  ],
);

/**
 * Exact charter periods the provider was asked to price and declined to offer.
 *
 * Occupancy says what is sold and `listing_price_period` says what season is open, and a
 * week can pass both and still be unsellable: Booking Manager publishes a rate for periods
 * its offers engine then refuses, because the boat is at the wrong base, or a turnaround
 * has nowhere to fit. Measured across the account, 250 to 400 boats a week are free, priced
 * and unbookable, and we were advertising every one of them.
 *
 * Rows are the vendor's answer about one exact period, never a statement about the days it
 * spans, which is why `availability-rules` matches them on both ends. A refused fortnight
 * says nothing about the free week that starts the same Saturday.
 *
 * Written only from a sweep that completed. A partial answer means "not asked yet", and
 * turning that into a refusal would hide sellable weeks on the strength of not having looked.
 */
export const listingRefusedPeriod = pgTable(
  "listing_refused_period",
  {
    id: id("lrp"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    listingSourceId: text("listing_source_id").references(() => listingSource.id, {
      onDelete: "set null",
    }),
    listingOfferId: text("listing_offer_id")
      .notNull()
      .references(() => listingOffer.id, { onDelete: "cascade" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("listing_refused_period_uq").on(t.listingOfferId, t.startDate, t.endDate),
    index("listing_refused_period_lookup_idx").on(t.listingId, t.startDate, t.endDate),
  ],
);
