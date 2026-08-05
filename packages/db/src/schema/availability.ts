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
