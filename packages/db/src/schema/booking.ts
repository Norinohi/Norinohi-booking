import { relations } from "drizzle-orm";
import {
  index,
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

export const paymentScheduleKind = pgEnum("payment_schedule_kind", ["deposit", "balance", "full"]);

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
    provider: text("provider").notNull(),
    providerReservationId: text("provider_reservation_id"),
    providerOptionId: text("provider_option_id"),
    providerStatus: text("provider_status"),
    holdExpiresAt: timestamp("hold_expires_at"),
    confirmedAt: timestamp("confirmed_at"),
    cancelledAt: timestamp("cancelled_at"),
    cancelReason: text("cancel_reason"),
    totalMinor: integer("total_minor").notNull(),
    currency: text("currency").notNull(),
    commercialSnapshot: jsonb("commercial_snapshot").$type<CommercialSnapshot>().notNull(),
    /** Unique so a retried checkout cannot create a second booking (§6.2). */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    ...timestamps,
  },
  (t) => [
    index("booking_user_idx").on(t.userId),
    index("booking_status_idx").on(t.status),
    index("booking_listing_idx").on(t.listingId),
    index("booking_hold_expires_idx").on(t.holdExpiresAt),
    // Two CONFIRMED bookings must never share one provider option (§6.2).
    unique("booking_provider_option_uq").on(t.provider, t.providerOptionId),
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
    pricingType: text("pricing_type"),
    amountMinor: integer("amount_minor"),
    currency: text("currency"),
    ...timestamps,
  },
  (t) => [index("booking_extra_booking_idx").on(t.bookingId)],
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
