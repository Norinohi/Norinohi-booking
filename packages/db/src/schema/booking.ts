import { relations, sql } from "drizzle-orm";
import {
  index,
  uniqueIndex,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { listing } from "./listing";
import { provider } from "./provider";
import { quote } from "./quote";

/** docs/backend-architecture.md §6. Lifecycle is canonical; provider fields mirror. */
export const bookingStatus = pgEnum("booking_status", [
  "DRAFT",
  "QUOTED",
  "OPTION_PENDING",
  "OPTION_HELD",
  "PAYMENT_PENDING",
  "CONFIRMING",
  "CONFIRMED",
  "QUOTE_EXPIRED",
  "OPTION_EXPIRED",
  "PAYMENT_FAILED",
  "PROVIDER_REJECTED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
]);

/**
 * The booking sidebar shows three legs, not two: prepayment now, a second payment
 * on a date, then extras plus the refundable security deposit at check-in.
 * `security_deposit` rows are tracked but never counted as revenue.
 */
export const paymentScheduleKind = pgEnum("payment_schedule_kind", [
  "deposit",
  "balance",
  "full",
  "checkin_extras",
  "security_deposit",
]);

export const bookingPaymentMethod = pgEnum("booking_payment_method", ["card", "invoice"]);

export const extraPricingType = pgEnum("extra_pricing_type", [
  "per_booking",
  "per_week",
  "pay_at_check_in",
]);

export const bookingConsentKind = pgEnum("booking_consent_kind", ["terms", "cancellation_policy"]);

export const paymentScheduleStatus = pgEnum("payment_schedule_status", [
  "pending",
  "paid",
  "cancelled",
]);

export const paymentStatus = pgEnum("payment_status", [
  "requires_payment",
  "processing",
  "succeeded",
  "failed",
  "refunded",
]);

export const providerReservationEventKind = pgEnum("provider_reservation_event_kind", [
  "option_created",
  "option_released",
  "confirm_requested",
  "confirm_succeeded",
  "confirm_failed",
  "cancel_requested",
  "cancel_succeeded",
  "info_created",
  "extras_updated",
]);

export type CommercialSnapshot = {
  listingTitle: string;
  baseName: string;
  locationName: string;
  countryName: string;
  mainImage: string | null;
  gallery: string[];
  category: string | null;
  crewType: string | null;
  rating: number;
  reviewCount: number;
  checkInTime: string | null;
  checkOutTime: string | null;
  /**
   * Optional: rows written before these were captured have none of them, so
   * readers must fall back rather than assume they are present.
   */
  baseLat?: number | null;
  baseLng?: number | null;
  baseEmail?: string | null;
  basePhone?: string | null;
  baseWebsite?: string | null;
  depositInsuranceIncluded?: boolean;
  petsAllowed?: boolean;
  specs?: {
    lengthM: number;
    cabins: number;
    berths: number;
    heads: number;
    yearBuilt: number;
    sailType: string | null;
  };
  amenities?: string[];
};

/**
 * The booking aggregate. `commercialSnapshot` freezes what the customer saw at
 * confirmation — the My Bookings card must keep rendering correctly even after the
 * listing is renamed, re-photographed, or unpublished by the provider.
 */
export const booking = pgTable(
  "booking",
  {
    id: id("bkg"),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quote.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    listingId: text("listing_id")
      .notNull()
      .references(() => listing.id, { onDelete: "restrict" }),
    status: bookingStatus("status").default("DRAFT").notNull(),
    /** Human-facing reference shown on the confirmation screen and in emails. */
    reference: text("reference").notNull().unique(),
    provider: text("provider")
      .notNull()
      .references(() => provider.code, { onDelete: "restrict" }),
    providerReservationId: text("provider_reservation_id"),
    providerOptionId: text("provider_option_id"),
    /**
     * NauSYS rotates this per-reservation security token whenever important
     * reservation data changes, and every subsequent call must send the latest one.
     */
    providerReservationUuid: text("provider_reservation_uuid"),
    providerStatus: text("provider_status"),
    holdExpiresAt: timestamp("hold_expires_at"),
    confirmedAt: timestamp("confirmed_at"),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),
    totalMinor: integer("total_minor").notNull(),
    currency: text("currency").notNull(),
    // Collected on the Guest Details step. Kept on the booking rather than read
    // back off the user, because the person chartering is not always the account
    // holder and these are what the base manager is given.
    guestFullName: text("guest_full_name"),
    guestEmail: text("guest_email"),
    guestPhone: text("guest_phone"),
    specialRequests: text("special_requests"),
    /** Null until the Payment step; the flow can also end without either. */
    paymentMethod: bookingPaymentMethod("payment_method"),
    commercialSnapshot: jsonb("commercial_snapshot").$type<CommercialSnapshot>().notNull(),
    /**
     * Unique per customer so a retried checkout cannot create a second booking
     * (§6.2). Scoped to the user rather than globally: the key is chosen by the
     * client, so any deterministic scheme collides across customers, and a global
     * constraint would let one customer's key stop another from booking at all.
     */
    idempotencyKey: text("idempotency_key").notNull(),
    ...timestamps,
  },
  (t) => [
    unique("booking_user_idempotency_uq").on(t.userId, t.idempotencyKey),
    index("booking_user_idx").on(t.userId),
    index("booking_status_idx").on(t.status),
    index("booking_listing_idx").on(t.listingId),
    index("booking_hold_expires_idx").on(t.holdExpiresAt),
    // Two *live* bookings must never share one provider option (§6.2). Partial on
    // purpose: a cancelled or expired booking has released its option, and a plain
    // unique index would lock that slot out of ever being booked again.
    uniqueIndex("booking_provider_option_uq")
      .on(t.provider, t.providerOptionId)
      .where(
        sql`${t.status} not in ('CANCELLED', 'REFUNDED', 'OPTION_EXPIRED', 'QUOTE_EXPIRED', 'PROVIDER_REJECTED')`,
      ),
  ],
);

export const bookingExtra = pgTable(
  "booking_extra",
  {
    id: id("bkge"),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull(),
    pricingType: extraPricingType("pricing_type"),
    amountMinor: integer("amount_minor"),
    currency: text("currency"),
    ...timestamps,
  },
  (t) => [index("booking_extra_booking_idx").on(t.bookingId)],
);

/**
 * The two Review & Book checkboxes are a legal record, so each is stored with the
 * version of the policy that was on screen. Gating them client-side only would
 * leave nothing to point at in a dispute.
 */
export const bookingConsent = pgTable(
  "booking_consent",
  {
    id: id("bkgc"),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    kind: bookingConsentKind("kind").notNull(),
    policyVersion: text("policy_version").notNull(),
    acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
    ...timestamps,
  },
  (t) => [
    index("booking_consent_booking_idx").on(t.bookingId),
    unique("booking_consent_uq").on(t.bookingId, t.kind),
  ],
);

/**
 * Crew and passenger details. §10 forbids returning these from booking.get and
 * forbids logging them, so they are deliberately isolated in their own table.
 */
export const bookingTraveller = pgTable(
  "booking_traveller",
  {
    id: id("bkgt"),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    fullName: text("full_name").notNull(),
    role: text("role"),
    dateOfBirth: text("date_of_birth"),
    documentNumber: text("document_number"),
    nationality: text("nationality"),
    ...timestamps,
  },
  (t) => [index("booking_traveller_booking_idx").on(t.bookingId)],
);

export const paymentSchedule = pgTable(
  "payment_schedule",
  {
    id: id("pms"),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    kind: paymentScheduleKind("kind").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    dueAt: timestamp("due_at"),
    status: paymentScheduleStatus("status").default("pending").notNull(),
    ...timestamps,
  },
  (t) => [index("payment_schedule_booking_idx").on(t.bookingId)],
);

export const payment = pgTable(
  "payment",
  {
    id: id("pmt"),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    scheduleId: text("schedule_id").references(() => paymentSchedule.id, {
      onDelete: "set null",
    }),
    kind: paymentScheduleKind("kind").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: paymentStatus("status").default("requires_payment").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    // client_secret is deliberately absent: it is transient, returned straight to
    // the caller, and must never be at rest.
    failureReason: text("failure_reason"),
    paidAt: timestamp("paid_at"),
    refundedAt: timestamp("refunded_at"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    ...timestamps,
  },
  (t) => [
    index("payment_booking_idx").on(t.bookingId),
    index("payment_intent_idx").on(t.stripePaymentIntentId),
  ],
);

/** Append-only log of every provider call, for reconciliation and support. */
export const providerReservationEvent = pgTable(
  "provider_reservation_event",
  {
    id: id("pre"),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    kind: providerReservationEventKind("kind").notNull(),
    provider: text("provider").notNull(),
    providerReference: text("provider_reference"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("provider_reservation_event_booking_idx").on(t.bookingId)],
);

/**
 * Inbound webhooks, keyed by the sender's event id so redelivery is processed
 * exactly once (§6.2).
 */
export const providerWebhookEvent = pgTable(
  "provider_webhook_event",
  {
    id: id("pwh"),
    source: text("source").notNull(),
    externalEventId: text("external_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload"),
    processedAt: timestamp("processed_at"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("provider_webhook_event_uq").on(t.source, t.externalEventId)],
);

export const bookingRelations = relations(booking, ({ one, many }) => ({
  quote: one(quote, { fields: [booking.quoteId], references: [quote.id] }),
  user: one(user, { fields: [booking.userId], references: [user.id] }),
  listing: one(listing, { fields: [booking.listingId], references: [listing.id] }),
  extras: many(bookingExtra),
  travellers: many(bookingTraveller),
  consents: many(bookingConsent),
  schedules: many(paymentSchedule),
  payments: many(payment),
  events: many(providerReservationEvent),
}));

export const bookingExtraRelations = relations(bookingExtra, ({ one }) => ({
  booking: one(booking, { fields: [bookingExtra.bookingId], references: [booking.id] }),
}));

export const bookingTravellerRelations = relations(bookingTraveller, ({ one }) => ({
  booking: one(booking, { fields: [bookingTraveller.bookingId], references: [booking.id] }),
}));

export const bookingConsentRelations = relations(bookingConsent, ({ one }) => ({
  booking: one(booking, { fields: [bookingConsent.bookingId], references: [booking.id] }),
}));

export const paymentScheduleRelations = relations(paymentSchedule, ({ one, many }) => ({
  booking: one(booking, { fields: [paymentSchedule.bookingId], references: [booking.id] }),
  payments: many(payment),
}));

export const paymentRelations = relations(payment, ({ one }) => ({
  booking: one(booking, { fields: [payment.bookingId], references: [booking.id] }),
  schedule: one(paymentSchedule, {
    fields: [payment.scheduleId],
    references: [paymentSchedule.id],
  }),
}));

export const providerReservationEventRelations = relations(providerReservationEvent, ({ one }) => ({
  booking: one(booking, { fields: [providerReservationEvent.bookingId], references: [booking.id] }),
}));
