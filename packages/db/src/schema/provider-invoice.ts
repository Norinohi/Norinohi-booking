import { date, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { id, timestamps } from "./_shared";
import { booking } from "./booking";
import { provider } from "./provider";

/**
 * The invoices a vendor issued in our name, as it states them, beside the booking each is for.
 *
 * On NauSYS these are the agency's commission invoices to the charter company: what the vendor
 * says we earned on a reservation. Kept so finance can set that against the commission the
 * quote was priced on without opening the vendor's back office, and so a reservation invoiced
 * twice or not at all is visible here rather than at year end.
 *
 * `booking_id` is null for an invoice on a reservation we hold no booking for, which is worth
 * keeping too: a commission invoice for a charter we never sold is a question for the vendor.
 */
export const providerInvoice = pgTable(
  "provider_invoice",
  {
    id: id("pinv"),
    providerId: text("provider_id")
      .notNull()
      .references(() => provider.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    issuedOn: date("issued_on").notNull(),
    providerReservationId: text("provider_reservation_id"),
    bookingId: text("booking_id").references(() => booking.id, { onDelete: "set null" }),
    currency: text("currency").notNull(),
    totalMinor: integer("total_minor").notNull(),
    netMinor: integer("net_minor").notNull(),
    documentUrl: text("document_url"),
    lines: jsonb("lines")
      .$type<{ code: string; label: string; netMinor: number; vatRate?: number }[]>()
      .notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("provider_invoice_number_uq").on(t.providerId, t.number),
    index("provider_invoice_booking_idx").on(t.bookingId),
  ],
);
