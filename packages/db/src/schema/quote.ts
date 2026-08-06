import { relations } from "drizzle-orm";
import { date, index, integer, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { listing } from "./listing";

export const quoteStatus = pgEnum("quote_status", ["active", "expired", "consumed"]);

export type QuoteLine = {
  code: string;
  label: string;
  amountMinor: number;
  currency: string;
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
    paymentPolicy: jsonb("payment_policy").$type<QuotePaymentPolicy>().notNull(),
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
