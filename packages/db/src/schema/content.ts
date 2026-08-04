import { relations } from "drizzle-orm";
import { index, integer, pgTable, text } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { listing } from "./listing";

export const review = pgTable(
  "review",
  {
    id: id("rev"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    author: text("author"),
    body: text("body"),
    ...timestamps,
  },
  (t) => [index("review_listing_idx").on(t.listingId)],
);

export const faq = pgTable(
  "faq",
  {
    id: id("faq"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (t) => [index("faq_listing_idx").on(t.listingId)],
);

export const reviewRelations = relations(review, ({ one }) => ({
  listing: one(listing, {
    fields: [review.listingId],
    references: [listing.id],
  }),
}));

export const faqRelations = relations(faq, ({ one }) => ({
  listing: one(listing, {
    fields: [faq.listingId],
    references: [listing.id],
  }),
}));
