import { ORPCError } from "@orpc/server";
import { booking, payment, paymentSchedule } from "@yacht-charter/db/schema/booking";
import { bookingEnquiry, invoiceRequest } from "@yacht-charter/db/schema/checkout";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database, DatabaseExecutor } from "../context";
import type {
  bookingReceiptSchema,
  enquirySchema,
  invoiceRequestInputSchema,
  invoiceRequestSchema,
} from "../contracts/booking";
import { INVOICE_PAYMENT_TERMS_DAYS } from "../lib/company";
import { notifyInvoiceIssued } from "./booking-email";
import { readOwnedBooking } from "./booking-read";
import { amountDue } from "./checkout-amounts";
import { assertTransition, type BookingStatus } from "./booking-state";
type InvoiceResult = z.infer<typeof invoiceRequestSchema>;

type EnquiryResult = z.infer<typeof enquirySchema>;
type Receipt = z.infer<typeof bookingReceiptSchema>;

/**
 * "Request invoice" — the customer will pay by bank transfer. A payment row is
 * created so the money is tracked exactly like a card payment, but there is no
 * processor and no client secret; it settles when staff mark the transfer received.
 *
 * The bank details go out by email, after the transaction: the invoice exists whether or not
 * Resend answers, and a customer who never got the mail can still read them off the invoice
 * page. A re-submit returns the existing invoice and sends nothing, so the form cannot be used
 * to mail someone repeatedly.
 */
export async function requestInvoice(
  db: Database,
  userId: string,
  input: z.infer<typeof invoiceRequestInputSchema>,
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
        number: await nextInvoiceNumber(tx),
        dueAt: invoiceDueAt(row.quote.checkIn),
        billingEmail: input.billingEmail,
        billingName: input.billingName,
        companyName: input.companyName ?? null,
        vatNumber: input.vatNumber ?? null,
        registrationNumber: input.registrationNumber ?? null,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        postalCode: input.postalCode ?? null,
        countryCode: input.countryCode,
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
      .set({ status: "PAYMENT_PENDING" })
      .where(and(eq(booking.id, input.bookingId), eq(booking.status, current)));

    return request;
  });

  await notifyInvoiceIssued({
    to: input.billingEmail,
    guestName: input.billingName,
    bookingId: input.bookingId,
    reference: row.booking.reference,
    invoiceNumber: created.number,
    yachtName: row.booking.commercialSnapshot.listingTitle,
    amountMinor: created.amountMinor,
    currency: created.currency,
    dueAt: created.dueAt,
    checkIn: row.quote.checkIn,
    checkOut: row.quote.checkOut,
  });

  return present(created, "PAYMENT_PENDING");
}

/*
 * Gapless, monotonic, and never reused — the sequence is the only source. `nextval` does not roll
 * back with the transaction, so a failed insert burns a number rather than handing it to the next
 * caller; a burnt number is a far smaller problem than two invoices sharing one.
 */
async function nextInvoiceNumber(tx: DatabaseExecutor): Promise<string> {
  const result = await tx.execute(sql`select nextval('invoice_number_seq') as value`);
  // `nextval` returns bigint, which the driver hands back as a string.
  const value = z.coerce.number().int().positive().safeParse(result.rows[0]?.value);

  if (!value.success) throw new ORPCError("INTERNAL_SERVER_ERROR");

  return `INV-${new Date().getUTCFullYear()}-${String(value.data).padStart(6, "0")}`;
}

/**
 * Standard payment terms, except that the money has to be with us before the boat leaves —
 * a charter starting in three days cannot carry a seven-day due date.
 */
function invoiceDueAt(checkIn: string): Date {
  const terms = new Date(Date.now() + INVOICE_PAYMENT_TERMS_DAYS * 24 * 60 * 60 * 1000);
  const start = new Date(`${checkIn}T00:00:00.000Z`);

  return start < terms ? start : terms;
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

function present(
  row: typeof invoiceRequest.$inferSelect,
  bookingStatus: BookingStatus,
): InvoiceResult {
  return {
    id: row.id,
    bookingId: row.bookingId,
    number: row.number,
    issuedAt: row.issuedAt.toISOString(),
    dueAt: row.dueAt.toISOString(),
    billingEmail: row.billingEmail,
    billingName: row.billingName,
    companyName: row.companyName,
    vatNumber: row.vatNumber,
    registrationNumber: row.registrationNumber,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    postalCode: row.postalCode,
    countryCode: row.countryCode,
    amount: { amountMinor: row.amountMinor, currency: row.currency },
    status: row.status,
    bookingStatus,
    createdAt: row.createdAt.toISOString(),
  };
}
