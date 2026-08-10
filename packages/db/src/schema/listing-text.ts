import { relations } from "drizzle-orm";
import { index, pgEnum, pgTable, text, unique } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { listing } from "./listing";

export const listingTextKind = pgEnum("listing_text_kind", [
  "description",
  "notes",
  "conditions",
  "one_way_note",
]);

/** Providers ship the same prose in several languages; locales are BCP-47 short tags. */
export const listingText = pgTable(
  "listing_text",
  {
    id: id("ltxt"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    kind: listingTextKind("kind").notNull(),
    locale: text("locale").notNull(),
    value: text("value").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("listing_text_locale_uq").on(t.listingId, t.kind, t.locale),
    index("listing_text_listing_idx").on(t.listingId),
  ],
);

export const listingTextRelations = relations(listingText, ({ one }) => ({
  listing: one(listing, {
    fields: [listingText.listingId],
    references: [listing.id],
  }),
}));
