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

import { id, pct, timestamps } from "./_shared";
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
  // and credit, which belong to no section. `requested` is ours, never a vendor's:
  // an extra the offer would not price, charged at the catalogue rate at check-in.
  group?: "mandatory" | "optional" | "crew" | "requested";
  // Which variant of the extra, where the offer sold it as several. `label` already ends with
  // it; kept apart so a translated label can be given it back.
  detail?: string;
  // The operator's own terms for the charge, where it wrote any. Fine print, never priced.
  note?: string;
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
    /**
     * Extras the customer asked for that no vendor will sell through us.
     *
     * Booking Manager publishes optional extras in its catalogue and exposes none on the offer
     * it quotes from; NauSYS prices its `service` id space and not its `equipment` one. Ticking
     * one of those as an ordinary extra would send a code the adapter drops -- billed nothing,
     * told nobody -- so they are carried here instead and settled with the base. The quote adds
     * each one it can count at its catalogue rate as a `requested` line paid at check-in, so the
     * total is the whole charter. `createBooking` writes them into the booking's special
     * requests, which is the one place a human on the other end reads.
     *
     * Separate from `extras` rather than a flag inside it, because everything downstream of
     * `extras` is arithmetic: the lines, the deposit, the hash checkout re-validates against.
     */
    requestedExtras: jsonb("requested_extras").$type<string[]>().default([]).notNull(),
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
    /**
     * The handover times, "HH:mm" at the marina, the vendor put on this offer, or null where it
     * stated none. Kept because the booking is built from this row after the live response is
     * gone, and NauSYS names the times on the offer but not on the option the hold opens.
     */
    checkInTime: text("check_in_time"),
    checkOutTime: text("check_out_time"),
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
/** Where an attempt's commission rate came from. See `quote_offer_attempt.commission_source`. */
export const commissionSource = pgEnum("commission_source", ["provider", "agreement"]);

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
    /**
     * The two halves of that total, and the rate the winner was chosen on.
     *
     * Recorded for the same reason `total_minor` is: the choice has to be replayable. Once the
     * ranking can be told to compare charter rates rather than all-in totals, "we picked the
     * cheaper base" is a claim about a number that appears nowhere else -- the quote keeps only
     * what the customer pays. `commission_pct` is the rate that applied on the day, since the
     * agreement it came from can be edited or lapse afterwards.
     */
    baseMinor: integer("base_minor"),
    obligatoryExtrasMinor: integer("obligatory_extras_minor"),
    commissionPct: pct("commission_pct"),
    /**
     * The money behind that rate, where the vendor stated it, and which of the two answers
     * the ranking actually used.
     *
     * Both providers return a commission on every offer, per boat and per week, and that is
     * now what `commission_pct` carries whenever an offer had one. `provider_commission` --
     * a rate staff type in for a vendor or one of its operators -- is the fallback for an
     * offer that carried none. The source is recorded because the two are different kinds of
     * claim: replaying a tie broken on a live vendor figure and one broken on an agreement
     * that has since lapsed are not the same exercise.
     */
    commissionMinor: integer("commission_minor"),
    commissionSource: commissionSource("commission_source"),
    currency: text("currency"),
    latencyMs: integer("latency_ms"),
    /** The `RangeVerdict` for `ineligible`, the provider error class otherwise. */
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("quote_offer_attempt_quote_idx").on(t.quoteId),
    index("quote_offer_attempt_listing_idx").on(t.listingId, t.createdAt),
    /*
     * How a vendor has been answering lately, which the listing index cannot serve: that one
     * leads on a boat, and the question here spans every boat one vendor was asked about.
     *
     * Built under a write lock rather than concurrently, which is what drizzle emits and what
     * the migrator's own transaction allows. The table holds one row per vendor asked per
     * quote, so it is small and its only writer is the quote path, which waits rather than
     * fails. Worth revisiting as its own migration if this ever reaches millions of rows.
     */
    index("quote_offer_attempt_provider_idx").on(t.provider, t.createdAt),
  ],
);
