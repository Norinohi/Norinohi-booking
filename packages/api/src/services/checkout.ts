import { ORPCError } from "@orpc/server";
import { booking, payment, paymentSchedule } from "@yacht-charter/db/schema/booking";
import { bookingEnquiry, invoiceRequest } from "@yacht-charter/db/schema/checkout";
import { quote } from "@yacht-charter/db/schema/quote";
import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  bookingReceiptSchema,
  enquirySchema,
  invoiceRequestSchema,
} from "../contracts/booking";
import { readOwnedBooking } from "./booking-read";
import { assertTransition, type BookingStatus } from "./booking-state";
type InvoiceResult = z.infer<typeof invoiceRequestSchema>;

type EnquiryResult = z.infer<typeof enquirySchema>;
type Receipt = z.infer<typeof bookingReceiptSchema>;

/**
 * "Request invoice" — the customer will pay by bank transfer. A payment row is
 * created so the money is tracked exactly like a card payment, but there is no
 * processor and no client secret; it settles when staff mark the transfer received.
 *
 * Nothing is emailed. The invoice_request row is the durable record until email
 * infrastructure exists.
 */
export async function requestInvoice(
  db: Database,
  userId: string,
  input: { bookingId: string; billingEmail: string; companyName?: string; vatNumber?: string },
): Promise<InvoiceResult> {
  const row = await readOwnedBooking(db, userId, input.bookingId);
  const current = row.booking.status;

  const [existing] = await db
    .select()
    .from(invoiceRequest)
    .where(eq(invoiceRequest.bookingId, input.bookingId))
    .limit(1);

  // Re-submitting the form must not stack up invoice requests or payments.
  if (existing) {
    return present(existing, current);
  }

  assertTransition(current, "PAYMENT_PENDING");

  const amountMinor = amountDue(row.quote, "deposit");

  const created = await db.transaction(async (tx) => {
    const [request] = await tx
      .insert(invoiceRequest)
      .values({
        bookingId: input.bookingId,
        billingEmail: input.billingEmail,
        companyName: input.companyName ?? null,
        vatNumber: input.vatNumber ?? null,
        amountMinor,
        currency: row.booking.currency,
      })
      .returning();

    if (!request) throw new ORPCError("INTERNAL_SERVER_ERROR");

    const [schedule] = await tx
      .insert(paymentSchedule)
      .values({
        bookingId: input.bookingId,
        kind: "deposit",
        amountMinor,
        currency: row.booking.currency,
      })
      .returning({ id: paymentSchedule.id });

    await tx.insert(payment).values({
      bookingId: input.bookingId,
      scheduleId: schedule?.id ?? null,
      kind: "deposit",
      amountMinor,
      currency: row.booking.currency,
      status: "requires_payment",
      idempotencyKey: `invoice:${request.id}`,
    });

    await tx
      .update(booking)
      .set({ status: "PAYMENT_PENDING", paymentMethod: "invoice" })
      .where(and(eq(booking.id, input.bookingId), eq(booking.status, current)));

    return request;
  });

  return present(created, "PAYMENT_PENDING");
}

/**
 * "Ask a question" — a pre-payment request such as a licence check. The booking is
 * deliberately left where it is: asking a question is not a commitment to pay, and
 * the provider option keeps running down as normal.
 */
export async function askQuestion(
  db: Database,
  userId: string,
  input: { bookingId: string; question: string },
): Promise<EnquiryResult> {
  const row = await readOwnedBooking(db, userId, input.bookingId);

  const [created] = await db
    .insert(bookingEnquiry)
    .values({ bookingId: input.bookingId, userId, question: input.question })
    .returning();

  if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");

  return {
    id: created.id,
    bookingId: created.bookingId,
    question: created.question,
    status: created.status,
    answer: created.answer,
    answeredAt: created.answeredAt?.toISOString() ?? null,
    bookingStatus: row.booking.status,
    createdAt: created.createdAt.toISOString(),
  };
}

export async function getReceipt(
  db: Database,
  userId: string,
  bookingId: string,
): Promise<Receipt> {
  const row = await readOwnedBooking(db, userId, bookingId);
  const snapshot = row.booking.commercialSnapshot;

  const payments = await db
    .select()
    .from(payment)
    .where(eq(payment.bookingId, bookingId))
    .orderBy(desc(payment.createdAt));

  const paidMinor = payments
    .filter((item) => item.status === "succeeded")
    .reduce((total, item) => total + item.amountMinor, 0);

  return {
    reference: row.booking.reference,
    issuedAt: new Date().toISOString(),
    status: row.booking.status,
    guest: { fullName: row.booking.guestFullName, email: row.booking.guestEmail },
    listingTitle: snapshot.listingTitle,
    baseName: snapshot.baseName,
    locationName: snapshot.locationName,
    countryName: snapshot.countryName,
    checkIn: row.quote.checkIn,
    checkOut: row.quote.checkOut,
    guests: row.quote.guests,
    lines: row.quote.lines.map((line) => ({
      code: line.code,
      label: line.label,
      amount: { amountMinor: line.amountMinor, currency: line.currency },
      payWhen: line.payWhen ?? "now",
      group: line.group ?? null,
    })),
    total: { amountMinor: row.booking.totalMinor, currency: row.booking.currency },
    securityDeposit:
      row.quote.securityDepositMinor === null
        ? null
        : { amountMinor: row.quote.securityDepositMinor, currency: row.booking.currency },
    paidTotal: { amountMinor: paidMinor, currency: row.booking.currency },
    balanceDue: {
      amountMinor: Math.max(row.booking.totalMinor - paidMinor, 0),
      currency: row.booking.currency,
    },
    payments: payments.map((item) => ({
      kind: item.kind,
      amount: { amountMinor: item.amountMinor, currency: item.currency },
      status: item.status,
      paidAt: item.paidAt?.toISOString() ?? null,
    })),
  };
}

/**
 * What to charge now. `deposit` follows the quote's payment policy; `full` is the
 * customer choosing to prepay everything. Lines marked pay-at-check-in are settled
 * with the base and are never part of either figure.
 */
export function amountDue(
  priced: typeof quote.$inferSelect,
  preference: "deposit" | "full",
): number {
  const atCheckIn = priced.lines
    .filter((line) => line.payWhen === "at_check_in")
    .reduce((total, line) => total + line.amountMinor, 0);

  const payableNow = Math.max(priced.totalMinor - atCheckIn, 0);

  if (preference === "full") return payableNow;
  return Math.min(priced.depositMinor, payableNow);
}

function present(
  row: typeof invoiceRequest.$inferSelect,
  bookingStatus: BookingStatus,
): InvoiceResult {
  return {
    id: row.id,
    bookingId: row.bookingId,
    billingEmail: row.billingEmail,
    companyName: row.companyName,
    vatNumber: row.vatNumber,
    amount: { amountMinor: row.amountMinor, currency: row.currency },
    status: row.status,
    bookingStatus,
    createdAt: row.createdAt.toISOString(),
  };
}
