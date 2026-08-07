import { relations } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { user } from "./auth";
import { booking } from "./booking";

// The two non-card outcomes of the Payment step. Nothing here sends email — these
// rows are the durable record until a sender exists.
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
    // Frozen at request time; a later reprice must not change what was invoiced.
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: invoiceRequestStatus("status").default("pending").notNull(),
    settledAt: timestamp("settled_at"),
    ...timestamps,
  },
  (t) => [
    index("invoice_request_booking_idx").on(t.bookingId),
    index("invoice_request_status_idx").on(t.status),
  ],
);

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
