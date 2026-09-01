import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { id, pct, timestamps } from "./_shared";
import { user } from "./auth";

export const auditAction = pgEnum("audit_action", [
  "create",
  "update",
  "delete",
  "sync",
  "merge",
  "price_adjustment",
]);

export const priceAdjustmentType = pgEnum("price_adjustment_type", ["percentage", "fixed_amount"]);

export const priceAdjustmentTargetType = pgEnum("price_adjustment_target_type", [
  "listing",
  "operator",
  "region",
  "category",
  "all",
]);

export const auditLog = pgTable(
  "audit_log",
  {
    id: id("aud"),
    actorUserId: text("actor_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: auditAction("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("audit_log_actor_idx").on(t.actorUserId),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const priceAdjustmentRule = pgTable(
  "price_adjustment_rule",
  {
    id: id("par"),
    name: text("name").notNull(),
    type: priceAdjustmentType("type").notNull(),
    valueMinor: integer("value_minor"),
    valuePct: numeric("value_pct", { precision: 8, scale: 4 }),
    currency: text("currency"),
    priority: integer("priority").default(0).notNull(),
    stackable: boolean("stackable").default(false).notNull(),
    startsAt: date("starts_at"),
    endsAt: date("ends_at"),
    bookingWindowStart: date("booking_window_start"),
    bookingWindowEnd: date("booking_window_end"),
    active: boolean("active").default(true).notNull(),
    createdBy: text("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    index("price_adjustment_rule_active_idx").on(t.active),
    index("price_adjustment_rule_created_by_idx").on(t.createdBy),
  ],
);

export const priceAdjustmentTarget = pgTable(
  "price_adjustment_target",
  {
    id: id("pat"),
    ruleId: text("rule_id")
      .notNull()
      .references(() => priceAdjustmentRule.id, { onDelete: "cascade" }),
    targetType: priceAdjustmentTargetType("target_type").notNull(),
    targetId: text("target_id"),
    ...timestamps,
  },
  (t) => [index("price_adjustment_target_rule_idx").on(t.ruleId)],
);

export const paymentPolicySource = pgEnum("payment_policy_source", ["vendor", "marketplace"]);

/**
 * Marketplace-wide settings, as a single row.
 *
 * Enforced as a singleton by `id`, which carries a default and a check rather than a sequence:
 * a second row here would be a second answer to "how much do we collect up front", and the one
 * the query happened to read first would decide it. Readers use
 * `getMarketplaceSettings`, which falls back to the same defaults declared below when the row
 * has never been written, so an unmigrated or unseeded database prices exactly as it did
 * before this table existed.
 */
export const marketplaceSetting = pgTable(
  "marketplace_setting",
  {
    id: text("id").primaryKey().default("singleton"),
    /**
     * Which of the two payment flows is in force. They do not blend: `vendor` takes the
     * provider's own instalment plan and `marketplace` takes ours, and neither ever reads the
     * other's numbers. A per-listing `listing.payment_policy` still overrides both for that
     * one yacht, which is what it was for before this setting existed.
     */
    paymentPolicySource: paymentPolicySource("payment_policy_source").default("vendor").notNull(),
    /** Our own policy, used only when `payment_policy_source` is `marketplace`. */
    marketplaceMode: text("marketplace_mode")
      .$type<"deposit" | "full">()
      .default("deposit")
      .notNull(),
    /** A fraction, not a percentage: 0.5 is half. Ignored when the mode is `full`. */
    marketplaceDepositPct: pct("marketplace_deposit_pct").default("0.5000").notNull(),
    /**
     * Whether a charter starting soon must be paid in full whatever the chosen flow said.
     * This is a floor, not a third flow: it only ever tightens what the source resolved, and
     * switching it off means a provider's 30% stands even on a charter leaving tomorrow.
     */
    enforceDepositLeadTime: boolean("enforce_deposit_lead_time").default(true).notNull(),
    /** How many days ahead of check-in deposits stop being offered. */
    depositLeadTimeDays: integer("deposit_lead_time_days").default(60).notNull(),
    updatedByUserId: text("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [check("marketplace_setting_singleton", sql`${t.id} = 'singleton'`)],
);
