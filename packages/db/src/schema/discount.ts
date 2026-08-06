import { relations } from "drizzle-orm";
import { boolean, date, index, integer, numeric, pgTable, text, unique } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { priceAdjustmentTargetType, priceAdjustmentType } from "./admin";
import { user } from "./auth";

/*
 * Promo codes for the staff Discount Manager (Figma 972:55055 and its create/edit
 * modal). Distinct from price_adjustment_rule: a discount is entered by a customer
 * as a code and has a usage limit, whereas a rule is applied silently by the pricing
 * pipeline. Both share the type and target-type enums so the two tables stay
 * comparable, and both are internal-only — there are no operator accounts.
 *
 * Status (Active / Scheduled / Expired / Inactive) is derived from `active` plus the
 * date window, never stored: a stored copy would go stale the moment a window closes.
 */
export const discount = pgTable(
  "discount",
  {
    id: id("dsc"),
    name: text("name").notNull(),
    /** Always stored upper-cased; the contract normalizes before it reaches here. */
    code: text("code").notNull().unique(),
    type: priceAdjustmentType("type").notNull(),
    /** Set for `percentage`; 10.0000 means 10% off. */
    valuePct: numeric("value_pct", { precision: 8, scale: 4 }),
    /** Set for `fixed_amount`: the amount taken off, in minor units. */
    valueMinor: integer("value_minor"),
    currency: text("currency"),
    startsAt: date("starts_at"),
    endsAt: date("ends_at"),
    /** Null means unlimited. Compared against the redemption count. */
    usageLimit: integer("usage_limit"),
    active: boolean("active").default(true).notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("discount_active_idx").on(t.active), index("discount_code_idx").on(t.code)],
);

/**
 * What the discount applies to. `all` carries a null targetId; the other types point
 * at a listing, operator, region, or yacht_category id.
 */
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

/**
 * One row per successful use, which is what `usageLimit` is checked against.
 *
 * `bookingId` is plain text with no foreign key on purpose: the booking table lands
 * in M5, and this table has to exist before it. Add the reference then.
 */
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
