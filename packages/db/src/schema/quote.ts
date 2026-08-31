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
import { priceAdjustmentType } from "./admin";
import { listing } from "./listing";
import { listingOffer } from "./listing-offer";

export const quoteStatus = pgEnum("quote_status", ["active", "expired", "consumed"]);

export type QuoteLine = {
  code: string;
  label: string;
  amountMinor: number;
  currency: string;
  // at_check_in lines count toward the total but never the prepayment.
  payWhen: "now" | "at_check_in";
  // Exactly one line is `base`, the charter price internal rules move.
  kind: "base" | "extra" | "fee" | "adjustment" | "discount" | "credit";
  // Which section of the booking summary shows it. Absent on the base, discounts
  // and credit, which belong to no section.
  group?: "mandatory" | "optional" | "crew";
};

export type QuotePaymentPolicy = {
  mode: "deposit" | "full";
  depositPct: number;
  balanceDueAt?: string;
  currency: string;
};

// Immutable priced snapshot (§1.5): a reprice supersedes with a new row rather
// than mutating, so a booking is always traceable to the numbers agreed to.
// userId is nullable because quoting is public.
/** One sellable start/end base pair for a charter, priced all-in. */
export type QuoteRouteOption = {
  startBaseId?: string;
  endBaseId?: string;
  startBaseName?: string;
  endBaseName?: string;
  isOneWay: boolean;
  total: { amountMinor: number; currency: string };
};

export const quote = pgTable(
  "quote",
  {
    id: id("qte"),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "restrict" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /**
     * Which of the listing's offers this price came from.
     *
     * The listing alone cannot answer it: a hull both vendors sell is quoted through
     * whichever offer won on the day, and re-deriving that from the listing later would
     * name whichever provider a preference list happens to favour rather than the one the
     * customer was shown. Every later step reads the vendor from here.
     */
    listingOfferId: text("listing_offer_id").references(() => listingOffer.id, {
      onDelete: "restrict",
    }),
    provider: text("provider").notNull(),
    providerSourceId: text("provider_source_id").notNull(),
    providerQuoteId: text("provider_quote_id"),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    guests: integer("guests").notNull(),
    extras: jsonb("extras").$type<string[]>().default([]).notNull(),
    // Null when the customer never touched the crew control; a reprice that omits
    // it keeps whatever the superseded quote was priced with.
    crewType: text("crew_type"),
    currency: text("currency").notNull(),
    lines: jsonb("lines").$type<QuoteLine[]>().default([]).notNull(),
    totalMinor: integer("total_minor").notNull(),
    depositMinor: integer("deposit_minor").notNull(),
    // Refundable, taken at check-in: deliberately not part of total_minor.
    securityDepositMinor: integer("security_deposit_minor"),
    paymentPolicy: jsonb("payment_policy").$type<QuotePaymentPolicy>().notNull(),
    discountId: text("discount_id"),
    discountCode: text("discount_code"),
    // Redeemed for real at checkout, as a negative credit_ledger row.
    creditAppliedMinor: integer("credit_applied_minor").default(0).notNull(),
    // Re-fetched and compared by every state-advancing call, so a moved provider
    // price cannot pass silently (§6.2).
    /**
     * The provider-side bases this quote was priced for, where the offer named them.
     *
     * Persisted rather than re-derived because the reservation is opened from the stored quote,
     * often minutes later, and a fleet that sells one-way prices each base pair differently. The
     * hold used to send the listing's home base for both ends, which quietly booked a pairing the
     * vendor had not offered whenever the boat was moored at the other end of its run.
     */
    route: jsonb("route").$type<{ startBaseId?: string; endBaseId?: string }>(),
    /**
     * The other routes the provider offered for this charter, priced all-in, so a sidebar that
     * comes back to a stored quote can still show the choice rather than losing it on reload.
     * A snapshot like `lines`, and just as stale-able: the quote's own TTL governs both.
     */
    routeOptions: jsonb("route_options").$type<QuoteRouteOption[]>().default([]).notNull(),
    priceSourceHash: text("price_source_hash").notNull(),
    status: quoteStatus("status").default("active").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    validatedAt: timestamp("validated_at").defaultNow().notNull(),
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

// Why a quote's price differs from the provider's. Name and value are copied, not
// joined, so the record survives the rule being edited or deactivated.
export const priceAdjustmentSnapshot = pgTable(
  "price_adjustment_snapshot",
  {
    id: id("pas"),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "cascade" }),
    source: priceAdjustmentSource("source").notNull(),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    type: priceAdjustmentType("type").notNull(),
    valuePct: numeric("value_pct", { precision: 8, scale: 4 }),
    valueMinor: integer("value_minor"),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
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

/**
 * What happened when one offer was asked to price a charter.
 *
 * `ineligible` never reached the vendor: the offer's own calendar and rules already
 * refused the range, and `reason` carries the `RangeVerdict` that settled it. The rest
 * did, and `error`/`timeout` are how a vendor having a bad night is told apart from a
 * yacht that is genuinely sold.
 */
export const quoteOfferOutcome = pgEnum("quote_offer_outcome", [
  "won",
  "lost",
  /** The vendor was asked and said the period is gone, which is a fact about the boat. */
  "unavailable",
  "error",
  "timeout",
  "ineligible",
]);

/**
 * One row per offer asked, per quote attempt: the audit of why this vendor sold it.
 *
 * Without this, "we showed the cheaper price" is a claim nobody can check after the
 * fact, and there is no way to tell a marketplace genuinely quoting two vendors from
 * one quietly falling back to a single one every night.
 *
 * `quote_id` is null when every offer failed and no quote was persisted, which is
 * exactly the case worth being able to count. `listing_id` and the dates are carried so
 * a row stays readable without one.
 */
export const quoteOfferAttempt = pgTable(
  "quote_offer_attempt",
  {
    id: id("qatt"),
    quoteId: text("quote_id").references(() => quote.id, { onDelete: "cascade" }),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "cascade" }),
    listingOfferId: text("listing_offer_id").references(() => listingOffer.id, {
      onDelete: "set null",
    }),
    /* Kept as text beside the nullable offer id, so a retired offer still names its vendor. */
    provider: text("provider").notNull(),
    checkIn: date("check_in").notNull(),
    checkOut: date("check_out").notNull(),
    outcome: quoteOfferOutcome("outcome").notNull(),
    /** All-in comparable total, on the offers that answered with a price. */
    totalMinor: integer("total_minor"),
    currency: text("currency"),
    latencyMs: integer("latency_ms"),
    /** The `RangeVerdict` for `ineligible`, the provider error class otherwise. */
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("quote_offer_attempt_quote_idx").on(t.quoteId),
    index("quote_offer_attempt_listing_idx").on(t.listingId, t.createdAt),
  ],
);
