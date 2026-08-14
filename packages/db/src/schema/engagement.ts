import { relations } from "drizzle-orm";
import { date, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { id } from "./_shared";
import { listing } from "./listing";

/**
 * One row per viewer per listing per UTC day, which is what "N people viewed today"
 * claims — a raw hit counter would count the same visitor's five tab reloads as five
 * people. The unique constraint is the dedup: recording is an upsert that does nothing
 * on conflict.
 *
 * `viewer_key` is never the raw client id. `recordListingView` hashes it together with
 * the day, so the same visitor gets an unrelated key tomorrow and the table cannot be
 * used to follow one person across dates.
 *
 * Only the current day is ever read; older rows are kept for the trend and pruned by
 * the sweep cron. No `updated_at`: a view is an event, not a record that changes.
 */
export const listingView = pgTable(
  "listing_view",
  {
    id: id("lvw"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    viewedOn: date("viewed_on").notNull(),
    viewerKey: text("viewer_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("listing_view_daily_uq").on(t.listingId, t.viewedOn, t.viewerKey),
    index("listing_view_day_idx").on(t.viewedOn),
  ],
);

export const listingViewRelations = relations(listingView, ({ one }) => ({
  listing: one(listing, { fields: [listingView.listingId], references: [listing.id] }),
}));
