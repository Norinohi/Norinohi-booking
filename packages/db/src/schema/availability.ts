import { boolean, date, index, integer, pgEnum, pgTable, text, unique } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { listing } from "./listing";
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
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: availabilitySlotStatus("status").notNull(),
    availabilityConfirmed: boolean("availability_confirmed").default(true).notNull(),
    priceMinor: integer("price_minor"),
    currency: text("currency"),
    minNights: integer("min_nights"),
    checkinWeekday: integer("checkin_weekday"),
    checkoutWeekday: integer("checkout_weekday"),
    sourceHash: text("source_hash"),
    ...timestamps,
  },
  (t) => [
    unique("availability_slot_period_uq").on(t.listingId, t.startDate, t.endDate),
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
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    kind: pricePeriodKind("kind").notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("listing_price_period_uq").on(t.listingId, t.kind, t.startDate, t.endDate),
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
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("listing_free_period_uq").on(t.listingId, t.startDate, t.endDate),
    /*
     * Containment (`start <= checkIn and end >= checkOut`) is a range scan on this index. A
     * `daterange` with GiST would be the textbook answer and is worth revisiting at a fleet
     * size where this stops being an index probe over a handful of rows per listing.
     */
    index("listing_free_period_lookup_idx").on(t.listingId, t.startDate, t.endDate),
  ],
);
