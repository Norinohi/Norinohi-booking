import { relations } from "drizzle-orm";
import { boolean, index, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { listing } from "./listing";

export const referralRedemptionStatus = pgEnum("referral_redemption_status", [
  "pending",
  "credited",
  "void",
]);

export const profile = pgTable("profile", {
  id: id("prof"),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  // The profile form edits first/last name as separate fields; user.name stays the
  // display name better-auth writes on signup and social sign-in.
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  locale: text("locale"),
  currency: text("currency"),
  marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
  ...timestamps,
});

export const wishlist = pgTable(
  "wishlist",
  {
    id: id("wsh"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").default("Saved yachts").notNull(),
    ...timestamps,
  },
  (t) => [index("wishlist_user_idx").on(t.userId)],
);

export const wishlistItem = pgTable(
  "wishlist_item",
  {
    id: id("wshi"),
    wishlistId: text("wishlist_id")
      .notNull()
      .references(() => wishlist.id, { onDelete: "cascade" }),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("wishlist_item_listing_uq").on(t.wishlistId, t.listingId),
    index("wishlist_item_wishlist_idx").on(t.wishlistId),
    index("wishlist_item_listing_idx").on(t.listingId),
  ],
);

export const referral = pgTable(
  "referral",
  {
    id: id("ref"),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    active: boolean("active").default(true).notNull(),
    ...timestamps,
  },
  (t) => [index("referral_code_idx").on(t.code)],
);

export const referralRedemption = pgTable(
  "referral_redemption",
  {
    id: id("rred"),
    referralId: text("referral_id")
      .notNull()
      .references(() => referral.id, { onDelete: "restrict" }),
    referredUserId: text("referred_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: referralRedemptionStatus("status").default("pending").notNull(),
    creditedAt: timestamp("credited_at"),
    ...timestamps,
  },
  (t) => [
    unique("referral_redemption_user_uq").on(t.referralId, t.referredUserId),
    index("referral_redemption_referral_idx").on(t.referralId),
  ],
);

export const profileRelations = relations(profile, ({ one }) => ({
  user: one(user, {
    fields: [profile.userId],
    references: [user.id],
  }),
}));

export const wishlistRelations = relations(wishlist, ({ one, many }) => ({
  user: one(user, {
    fields: [wishlist.userId],
    references: [user.id],
  }),
  items: many(wishlistItem),
}));

export const wishlistItemRelations = relations(wishlistItem, ({ one }) => ({
  wishlist: one(wishlist, {
    fields: [wishlistItem.wishlistId],
    references: [wishlist.id],
  }),
  listing: one(listing, {
    fields: [wishlistItem.listingId],
    references: [listing.id],
  }),
}));

export const referralRelations = relations(referral, ({ one, many }) => ({
  user: one(user, {
    fields: [referral.userId],
    references: [user.id],
  }),
  redemptions: many(referralRedemption),
}));

export const referralRedemptionRelations = relations(referralRedemption, ({ one }) => ({
  referral: one(referral, {
    fields: [referralRedemption.referralId],
    references: [referral.id],
  }),
  referredUser: one(user, {
    fields: [referralRedemption.referredUserId],
    references: [user.id],
  }),
}));
