import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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

/*
 * Invoice numbers must be gapless and monotonic to be an accounting record, which rules out
 * deriving them from anything the row itself carries. `nextval` is transaction-safe and does
 * not roll back, so two concurrent requests can never mint the same number.
 */
export const invoiceNumberSeq = pgSequence("invoice_number_seq", { startWith: 1, increment: 1 });

export const invoiceRequest = pgTable(
  "invoice_request",
  {
    id: id("inv"),
    bookingId: text("booking_id")
      .notNull()
      .references(() => booking.id, { onDelete: "cascade" }),
    /** Human-facing document number — `INV-<year>-<sequence>`, see `invoiceNumberSeq`. */
    number: text("number").notNull(),
    issuedAt: timestamp("issued_at").defaultNow().notNull(),
    /** Payment terms, capped at check-in: the money has to land before the charter starts. */
    dueAt: timestamp("due_at").notNull(),
    billingEmail: text("billing_email").notNull(),
    // Who the invoice is made out to. `billingName` is the person or the legal entity's
    // contact; `companyName` is set only when the charter is billed to a business.
    billingName: text("billing_name"),
    companyName: text("company_name"),
    vatNumber: text("vat_number"),
    registrationNumber: text("registration_number"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    postalCode: text("postal_code"),
    /** ISO 3166-1 alpha-2, same shape as the booking's guest country. */
    countryCode: text("country_code"),
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
    uniqueIndex("invoice_request_number_idx").on(t.number),
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
