import { payment } from "@yacht-charter/db/schema/booking";
import { invoiceRequest } from "@yacht-charter/db/schema/checkout";
import { desc, eq } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type { invoiceDocumentSchema } from "../contracts/booking";
import { COMPANY } from "../lib/company";
import { readOwnedBooking } from "./booking-read";

type InvoiceDocument = z.infer<typeof invoiceDocumentSchema>;

/*
 * The printable invoice. Everything the page shows is assembled here — the seller block, the
 * billed party exactly as it was captured, the priced lines, and the transfer instructions — so
 * the document is one payload from one source rather than a layout stitching together three
 * queries and a config import in the browser.
 *
 * `null` when the booking has no invoice request: a card booking gets a receipt, not an invoice.
 */
export async function getInvoiceDocument(
  db: Database,
  userId: string,
  bookingId: string,
): Promise<InvoiceDocument> {
  const row = await readOwnedBooking(db, userId, bookingId);

  const [invoice] = await db
    .select()
    .from(invoiceRequest)
    .where(eq(invoiceRequest.bookingId, bookingId))
    .orderBy(desc(invoiceRequest.createdAt))
    .limit(1);

  if (!invoice) return null;

  const payments = await db.select().from(payment).where(eq(payment.bookingId, bookingId));

  const paidMinor = payments
    .filter((item) => item.status === "succeeded")
    .reduce((total, item) => total + item.amountMinor, 0);

  const snapshot = row.booking.commercialSnapshot;
  const currency = invoice.currency;

  return {
    number: invoice.number,
    issuedAt: invoice.issuedAt.toISOString(),
    dueAt: invoice.dueAt.toISOString(),
    status: invoice.status,
    seller: {
      legalName: COMPANY.legalName,
      tradingName: COMPANY.tradingName,
      addressLine1: COMPANY.addressLine1,
      addressLine2: COMPANY.addressLine2,
      city: COMPANY.city,
      postalCode: COMPANY.postalCode,
      countryCode: COMPANY.countryCode,
      vatNumber: COMPANY.vatNumber,
      registrationNumber: COMPANY.registrationNumber,
      email: COMPANY.email,
      phone: COMPANY.phone,
      website: COMPANY.website,
    },
    billTo: {
      // Pre-address invoice rows carry no billing name; the guest on the booking is who it was for.
      name: invoice.billingName ?? row.booking.guestFullName ?? invoice.billingEmail,
      email: invoice.billingEmail,
      companyName: invoice.companyName,
      vatNumber: invoice.vatNumber,
      registrationNumber: invoice.registrationNumber,
      addressLine1: invoice.addressLine1,
      addressLine2: invoice.addressLine2,
      city: invoice.city,
      postalCode: invoice.postalCode,
      countryCode: invoice.countryCode,
    },
    booking: {
      reference: row.booking.reference,
      status: row.booking.status,
      listingTitle: snapshot.listingTitle,
      baseName: snapshot.baseName,
      locationName: snapshot.locationName,
      countryName: snapshot.countryName,
      checkIn: row.quote.checkIn,
      checkOut: row.quote.checkOut,
      guests: row.quote.guests,
    },
    lines: row.quote.lines.map((line) => ({
      code: line.code,
      label: line.label,
      amount: { amountMinor: line.amountMinor, currency: line.currency },
      payWhen: line.payWhen ?? "now",
      group: line.group ?? null,
    })),
    total: { amountMinor: row.booking.totalMinor, currency },
    amountDue: { amountMinor: invoice.amountMinor, currency },
    paidTotal: { amountMinor: paidMinor, currency },
    balanceDue: { amountMinor: Math.max(row.booking.totalMinor - paidMinor, 0), currency },
    securityDeposit:
      row.quote.securityDepositMinor === null
        ? null
        : { amountMinor: row.quote.securityDepositMinor, currency },
    payment: {
      bankName: COMPANY.bank.name,
      iban: COMPANY.bank.iban,
      bic: COMPANY.bank.bic,
      // The booking reference, not the invoice number: staff match transfers against bookings,
      // and a reissued invoice must not orphan a payment already on its way.
      reference: row.booking.reference,
    },
  };
}
