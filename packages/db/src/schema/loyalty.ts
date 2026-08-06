import { relations } from "drizzle-orm";
import { index, integer, numeric, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { referralRedemption } from "./account";
import { booking } from "./booking";

/*
 * Referral rewards and the loyalty ladder behind the "Your Level" card.
 *
 * Tiers and perks are reference data seeded in src/seed.ts rather than hardcoded,
 * because marketing changes the ladder without a deploy. Everything that reads
 * them tolerates an empty table — an unseeded database shows no tier instead of
 * crashing the referrals screen.
 */

export const creditKind = pgEnum("credit_kind", [
  /** Earned by the referrer once their invitee's trip is confirmed. */
  "referral_reward",
  /** Spent against a booking. Always negative. */
  "booking_redemption",
  /** Written off when the 12-month window closes. Always negative. */
  "expiry",
  /** Manual correction by staff. */
  "adjustment",
]);

/**
 * Append-only. Balance is the sum of unexpired rows, never a stored number, so it
 * cannot drift from the entries that explain it.
 */
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: id("crd"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: creditKind("kind").notNull(),
    /** Signed minor units: positive earns, negative spends. */
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    /** The booking that earned or spent this, when there is one. */
    bookingId: text("booking_id").references(() => booking.id, { onDelete: "set null" }),
    /**
     * The referral this paid out for. Lets the history table show the exact reward
     * per row instead of guessing from ordering.
     */
    referralRedemptionId: text("referral_redemption_id").references(() => referralRedemption.id, {
      onDelete: "set null",
    }),
    /**
     * "Referral credits expire 12 months after being earned." Null never expires,
     * which is how a manual adjustment behaves.
     */
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
    /** Ordering, ascending. The lowest level is the entry tier. */
    level: integer("level").notNull(),
    /** Completed referral bookings needed to reach this tier. */
    requiredBookings: integer("required_bookings").notNull(),
    /** Extra credit on referral rewards at this tier, e.g. 0.05 for "5% extra". */
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
    /** Matches an i18n key under Referrals.how.level.perks. */
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
