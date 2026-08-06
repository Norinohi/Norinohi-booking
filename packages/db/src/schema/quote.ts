import { relations } from "drizzle-orm";
import {
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
import { listing } from "./listing";

export const quoteStatus = pgEnum("quote_status", ["active", "expired", "consumed"]);

export type QuoteLine = {
  code: string;
  label: string;
  amountMinor: number;
  currency: string;
  /**
   * When this line is actually collected. The booking sidebar prints "Pay at
   * check-in" under most extras, and those amounts are excluded from the
   * prepayment even though they count toward the total.
   */
  payWhen: "now" | "at_check_in";
  /** `base` is the charter price — the only line internal rules move. */
  kind: "base" | "extra" | "fee" | "adjustment" | "discount";
};

export type QuotePaymentPolicy = {
  mode: "deposit" | "full";
  depositPct: number;
  balanceDueAt?: string;
  currency: string;
};

/**
 * An immutable priced snapshot (docs/backend-architecture.md §1.5). Never mutated —
 * a re-price supersedes it with a new row, so a confirmed booking can always be
 * traced to the exact numbers the customer agreed to.
 *
 * `userId` is nullable because quoting is public: an anonymous visitor prices a
 * trip, then signs in at checkout.
 */
export const quote = pgTable(
  "quote",
  {
    id: id("qte"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "restrict" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** Which provider's live response this was priced from. */
    provider: text("provider").notNull(),
    providerSourceId: text("provider_source_id").notNull(),
    /** The provider's own quote id, needed to create the option against it. */
    providerQuoteId: text("provider_quote_id"),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    guests: integer("guests").notNull(),
    extras: jsonb("extras").$type<string[]>().default([]).notNull(),
    currency: text("currency").notNull(),
    lines: jsonb("lines").$type<QuoteLine[]>().default([]).notNull(),
    totalMinor: integer("total_minor").notNull(),
    depositMinor: integer("deposit_minor").notNull(),
    /**
     * Refundable security deposit, held at check-in and returned afterwards.
     * Deliberately NOT part of total_minor — the booking summary shows it as a
     * separate line and excludes it from "Total Price".
     */
    securityDepositMinor: integer("security_deposit_minor"),
    paymentPolicy: jsonb("payment_policy").$type<QuotePaymentPolicy>().notNull(),
    /** The promo code applied, frozen alongside the price it produced. */
    discountId: text("discount_id"),
    discountCode: text("discount_code"),
    /**
     * Fingerprint of the provider price this quote was built from. Every
     * state-advancing call re-fetches and compares, so a price change cannot pass
     * silently (§6.2).
     */
    priceSourceHash: text("price_source_hash").notNull(),
    status: quoteStatus("status").default("active").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    validatedAt: timestamp("validated_at").defaultNow().notNull(),
    /** Set when a reprice supersedes this quote, so the chain stays walkable. */
    supersededByQuoteId: text("superseded_by_quote_id"),
    ...timestamps,
  },
  (t) => [
    index("quote_listing_idx").on(t.listingId),
    index("quote_user_idx").on(t.userId),
    index("quote_status_expires_idx").on(t.status, t.expiresAt),
  ],
);

export const priceAdjustmentSource = pgEnum("price_adjustment_source", ["rule", "discount"]);

/**
 * Why a quote's price differs from the provider's. One row per rule or discount
 * that actually moved the number, in the order it was applied.
 *
 * Written once alongside the quote and never updated — a quote is immutable, so
 * this is the audit trail for "why was I charged this", and it has to survive the
 * rule being edited or deactivated afterwards.
 */
export const priceAdjustmentSnapshot = pgTable(
  "price_adjustment_snapshot",
  {
    id: id("pas"),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "cascade" }),
    source: priceAdjustmentSource("source").notNull(),
    /** The rule or discount id. Plain text: the source may be deleted later. */
    sourceId: text("source_id").notNull(),
    /** Copied, not joined — the name at the time is what the customer was shown. */
    name: text("name").notNull(),
    type: text("type").notNull(),
    valuePct: numeric("value_pct", { precision: 8, scale: 4 }),
    valueMinor: integer("value_minor"),
    /** The signed delta this step applied, in minor units. Negative reduces. */
    amountMinor: integer("amount_minor").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("price_adjustment_snapshot_quote_idx").on(t.quoteId)],
);

export const priceAdjustmentSnapshotRelations = relations(priceAdjustmentSnapshot, ({ one }) => ({
  quote: one(quote, {
    fields: [priceAdjustmentSnapshot.quoteId],
    references: [quote.id],
  }),
}));

export const quoteRelations = relations(quote, ({ one }) => ({
  listing: one(listing, {
    fields: [quote.listingId],
    references: [listing.id],
  }),
  user: one(user, {
    fields: [quote.userId],
    references: [user.id],
  }),
}));
