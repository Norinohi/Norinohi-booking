import { relations } from "drizzle-orm";
import { boolean, date, index, integer, numeric, pgTable, text, unique } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { priceAdjustmentTargetType, priceAdjustmentType } from "./admin";
import { user } from "./auth";

// Unlike price_adjustment_rule, a discount is entered by a customer as a code and
// has a usage limit. Status is derived from `active` plus the date window, never
// stored — a stored copy goes stale the moment a window closes.
export const discount = pgTable(
  "discount",
  {
    id: id("dsc"),
    name: text("name").notNull(),
    // Stored upper-cased; the contract normalizes before it reaches here.
    code: text("code").notNull().unique(),
    type: priceAdjustmentType("type").notNull(),
    valuePct: numeric("value_pct", { precision: 8, scale: 4 }),
    valueMinor: integer("value_minor"),
    currency: text("currency"),
    startsAt: date("starts_at"),
    endsAt: date("ends_at"),
    // Null means unlimited.
    usageLimit: integer("usage_limit"),
    active: boolean("active").default(true).notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("discount_active_idx").on(t.active), index("discount_code_idx").on(t.code)],
);

// `all` carries a null targetId; other types point at a listing, operator, region
// or yacht_category id.
export const discountTarget = pgTable(
  "discount_target",
  {
    id: id("dsct"),
    discountId: text("discount_id")
      .notNull()
      .references(() => discount.id, { onDelete: "cascade" }),
    targetType: priceAdjustmentTargetType("target_type").notNull(),
    targetId: text("target_id"),
    ...timestamps,
  },
  (t) => [
    index("discount_target_discount_idx").on(t.discountId),
    unique("discount_target_uq").on(t.discountId, t.targetType, t.targetId),
  ],
);

// One row per use, which is what usageLimit is checked against. bookingId has no
// FK because this table predates the booking table; add the reference when convenient.
export const discountRedemption = pgTable(
  "discount_redemption",
  {
    id: id("dscr"),
    discountId: text("discount_id")
      .notNull()
      .references(() => discount.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bookingId: text("booking_id"),
    amountMinor: integer("amount_minor"),
    currency: text("currency"),
    ...timestamps,
  },
  (t) => [
    index("discount_redemption_discount_idx").on(t.discountId),
    index("discount_redemption_user_idx").on(t.userId),
    unique("discount_redemption_booking_uq").on(t.discountId, t.bookingId),
  ],
);

export const discountRelations = relations(discount, ({ many, one }) => ({
  targets: many(discountTarget),
  redemptions: many(discountRedemption),
  createdByUser: one(user, {
    fields: [discount.createdBy],
    references: [user.id],
  }),
}));

export const discountTargetRelations = relations(discountTarget, ({ one }) => ({
  discount: one(discount, {
    fields: [discountTarget.discountId],
    references: [discount.id],
  }),
}));

export const discountRedemptionRelations = relations(discountRedemption, ({ one }) => ({
  discount: one(discount, {
    fields: [discountRedemption.discountId],
    references: [discount.id],
  }),
  user: one(user, {
    fields: [discountRedemption.userId],
    references: [user.id],
  }),
}));
