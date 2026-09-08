import { relations, sql } from "drizzle-orm";
import { boolean, check, date, index, pgTable, text } from "drizzle-orm/pg-core";

import { id, pct, timestamps } from "./_shared";
import { user } from "./auth";
import { operator } from "./operator";
import { provider } from "./provider";

/*
 * What CharterNavi earns through a vendor, and from when.
 *
 * Ships empty. The client agreed that where two vendors offer the same yacht at the same
 * price and the same obligatory extras, the one paying us more wins the sale -- and then had
 * no rates to give us. An empty table is that step switched off: the resolver answers zero for
 * every offer, the comparator finds nothing to separate them by, and the sale falls through to
 * the step below exactly as it does today. A separate "commission ranking enabled" flag would
 * be a second way of saying the same thing, and the two would drift.
 *
 * Never a customer-facing number. The agreement is explicit that our commission may not be the
 * reason a visitor is shown a dearer boat: it breaks a tie between offers already equal on
 * price, and nothing else.
 */
export const providerCommission = pgTable(
  "provider_commission",
  {
    id: id("pcm"),
    providerId: text("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),
    /**
     * The operator this rate is negotiated for, or null for every operator at this vendor.
     *
     * Cascades rather than nulling on delete. A row that lost its operator would silently
     * widen from one fleet's rate to the whole vendor's, which is a pricing decision nobody
     * made and one nothing in the audit trail would explain.
     */
    operatorId: text("operator_id").references(() => operator.id, { onDelete: "cascade" }),
    /**
     * A percentage, not a fraction: 15.0000 is fifteen percent.
     *
     * Matches `discount.value_pct`, the other rate staff type into an admin form, rather than
     * `marketplace_setting.marketplace_deposit_pct`, which is a fraction because nobody enters
     * it as a number they would say out loud.
     */
    ratePct: pct("rate_pct").notNull(),
    /** Both ends optional and inclusive; null means open-ended in that direction. */
    startsAt: date("starts_at"),
    endsAt: date("ends_at"),
    /**
     * Switched off without being deleted, so a lapsed agreement stays readable.
     *
     * Overlapping windows are not refused by the database: expressing that needs an exclusion
     * constraint over a daterange, which nothing else in this schema uses. The service warns on
     * an overlap and `resolveCommissionRate` is deterministic when one slips through anyway.
     */
    active: boolean("active").default(true).notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("provider_commission_provider_idx").on(t.providerId, t.active),
    index("provider_commission_operator_idx").on(t.operatorId),
    check("provider_commission_rate_range", sql`${t.ratePct} >= 0 and ${t.ratePct} <= 100`),
  ],
);

export const providerCommissionRelations = relations(providerCommission, ({ one }) => ({
  provider: one(provider, {
    fields: [providerCommission.providerId],
    references: [provider.id],
  }),
  operator: one(operator, {
    fields: [providerCommission.operatorId],
    references: [operator.id],
  }),
}));
