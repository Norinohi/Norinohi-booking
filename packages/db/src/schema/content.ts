import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

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

/* Declaration order is the display order: Postgres sorts an enum by it, so `order by category`
   in the detail read needs no CASE and cannot drift from what the client sent. */
export const faqCategory = pgEnum("faq_category", [
  "booking",
  "payment",
  "prices",
  "licences",
  "travel",
  "cancellation",
]);

export const faq = pgTable(
  "faq",
  {
    id: id("faq"),
    /* Null means site-wide: the same entry on every listing page. A listing row carries no
       category, because the six are the site-wide taxonomy the client wrote. */
    listingId: text("listing_id").references(() => listing.id, { onDelete: "cascade" }),
    category: faqCategory("category"),
    locale: text("locale").notNull().default("en"),
    question: text("question").notNull(),
    /* Nullable because the client sent 20 questions and no answers. An unanswered entry is a
       real row - it holds its place in the order and can be filled in - and the read path drops
       it, so a heading never renders over nothing. */
    answer: text("answer"),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (t) => [
    index("faq_listing_idx").on(t.listingId),
    index("faq_site_wide_idx")
      .on(t.locale, t.category, t.sortOrder)
      .where(sql`${t.listingId} is null`),
    /* A site-wide entry with no category has no group to render under, which is the one
       combination the grouped page cannot place. */
    check("faq_scope_ck", sql`${t.listingId} is not null or ${t.category} is not null`),
  ],
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
