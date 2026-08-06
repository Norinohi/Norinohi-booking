import { relations } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { booking } from "./booking";

/*
 * The Payment step offers three ways to proceed, and only one of them takes money:
 * Pay by card, Request invoice, and Ask a question. The two non-card paths end the
 * checkout without a charge, so they get their own records rather than being
 * squeezed into `payment`.
 *
 * Nothing here sends email — there is no email infrastructure in the repo yet, so
 * these rows are the durable record and delivery is a later milestone. Do not add
 * a "sent" side effect without also adding the sender.
 */

export const invoiceRequestStatus = pgEnum("invoice_request_status", [
  "pending",
  "sent",
  "paid",
  "cancelled",
]);

export const bookingEnquiryStatus = pgEnum("booking_enquiry_status", [
  "open",
  "answered",
  "closed",
]);

/** "Request invoice" — the customer intends to pay by bank transfer. */
export const invoiceRequest = pgTable(
  "invoice_request",
  {
    id: id("inv"),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    billingEmail: text("billing_email").notNull(),
    companyName: text("company_name"),
    vatNumber: text("vat_number"),
    /** Frozen at request time so a later reprice cannot change what was asked for. */
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: invoiceRequestStatus("status").default("pending").notNull(),
    /** Set by staff when the transfer lands; there is no screen for this yet. */
    settledAt: timestamp("settled_at"),
    ...timestamps,
  },
  (t) => [
    index("invoice_request_booking_idx").on(t.bookingId),
    index("invoice_request_status_idx").on(t.status),
  ],
);

/** "Ask a question" — a pre-payment request (licence checks, special requirements). */
export const bookingEnquiry = pgTable(
  "booking_enquiry",
  {
    id: id("enq"),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    status: bookingEnquiryStatus("status").default("open").notNull(),
    answer: text("answer"),
    answeredAt: timestamp("answered_at"),
    ...timestamps,
  },
  (t) => [
    index("booking_enquiry_booking_idx").on(t.bookingId),
    index("booking_enquiry_status_idx").on(t.status),
  ],
);

export const invoiceRequestRelations = relations(invoiceRequest, ({ one }) => ({
  booking: one(booking, { fields: [invoiceRequest.bookingId], references: [booking.id] }),
}));

export const bookingEnquiryRelations = relations(bookingEnquiry, ({ one }) => ({
  booking: one(booking, { fields: [bookingEnquiry.bookingId], references: [booking.id] }),
  user: one(user, { fields: [bookingEnquiry.userId], references: [user.id] }),
}));
