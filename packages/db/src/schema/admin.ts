import {
  boolean,
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

import { id, timestamps } from "./_shared";
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
