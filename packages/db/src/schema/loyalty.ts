import { relations } from "drizzle-orm";
import { index, integer, numeric, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { referralRedemption } from "./account";
import { booking } from "./booking";

// Tiers and perks are seeded reference data, not constants: readers tolerate an
// empty table so an unseeded database degrades instead of breaking.
export const creditKind = pgEnum("credit_kind", [
  "referral_reward",
  "booking_redemption",
  "expiry",
  "adjustment",
]);

// Append-only: the balance is the sum of unexpired rows, never a stored number.
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: id("crd"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: creditKind("kind").notNull(),
    // Signed: positive earns, negative spends.
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    bookingId: text("booking_id").references(() => booking.id, { onDelete: "set null" }),
    referralRedemptionId: text("referral_redemption_id").references(() => referralRedemption.id, {
      onDelete: "set null",
    }),
    // Null never expires, which is how a manual adjustment behaves.
    expiresAt: timestamp("expires_at"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("credit_ledger_user_idx").on(t.userId),
    index("credit_ledger_expires_idx").on(t.expiresAt),
  ],
);

export const loyaltyTier = pgTable(
  "loyalty_tier",
  {
    id: id("tier"),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    level: integer("level").notNull(),
    requiredBookings: integer("required_bookings").notNull(),
    referralBonusPct: numeric("referral_bonus_pct", { precision: 6, scale: 4 })
      .default("0")
      .notNull(),
    ...timestamps,
  },
  (t) => [index("loyalty_tier_level_idx").on(t.level)],
);

export const loyaltyPerk = pgTable(
  "loyalty_perk",
  {
    id: id("perk"),
    tierId: text("tier_id")
      .notNull()
      .references(() => loyaltyTier.id, { onDelete: "cascade" }),
    // Matches an i18n key under Referrals.how.level.perks.
    code: text("code").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (t) => [index("loyalty_perk_tier_idx").on(t.tierId)],
);

export const loyaltyTierRelations = relations(loyaltyTier, ({ many }) => ({
  perks: many(loyaltyPerk),
}));

export const loyaltyPerkRelations = relations(loyaltyPerk, ({ one }) => ({
  tier: one(loyaltyTier, { fields: [loyaltyPerk.tierId], references: [loyaltyTier.id] }),
}));

export const creditLedgerRelations = relations(creditLedger, ({ one }) => ({
  user: one(user, { fields: [creditLedger.userId], references: [user.id] }),
  booking: one(booking, { fields: [creditLedger.bookingId], references: [booking.id] }),
}));
