import { ORPCError } from "@orpc/server";
import { booking, payment, paymentSchedule } from "@yacht-charter/db/schema/booking";
import { bookingEnquiry, invoiceRequest } from "@yacht-charter/db/schema/checkout";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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
import { payableNowFor } from "./checkout-amounts";
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
 * page. A re-submit returns the standing invoice and sends nothing, so the form cannot be used
 * to mail someone repeatedly.
 *
 * A booking can be invoiced more than once, because a deposit-policy charter is paid in two
 * instalments and the second is as transferable as the first. What is invoiced is
 * `payableNowFor` — the same figure the card would charge and the same one the balance screen
 * offers — rather than the quote's deposit, which on a confirmed booking would raise a document
 * for money already received. It is only ever one open invoice at a time: a second is possible
 * once the first has been settled or cancelled.
 */
export async function requestInvoice(
  db: Database,
  userId: string,
  input: z.infer<typeof invoiceRequestInputSchema>,
): Promise<InvoiceResult> {
  const row = await readOwnedBooking(db, userId, input.bookingId);
  const current = row.booking.status;

  // Re-submitting the form must not stack up invoice requests or payments. Narrowed to the
  // requests still awaiting money: a settled one is a closed instalment, not a duplicate.
  const [standing] = await db
    .select()
    .from(invoiceRequest)
    .where(
      and(
        eq(invoiceRequest.bookingId, input.bookingId),
        inArray(invoiceRequest.status, ["pending", "sent"]),
      ),
    )
    .orderBy(desc(invoiceRequest.createdAt))
    .limit(1);

  if (standing) {
    return present(standing, current);
  }

  const paidMinor = await settledPaidMinor(db, input.bookingId);
  const amountMinor = payableNowFor(row.quote, paidMinor, row.booking);

  // Zero covers every reason there is nothing to raise a document for: settled, cancelled,
  // mid-commit, or a quote or provider hold that has lapsed and has to be repriced first.
  if (amountMinor <= 0) {
    throw new ORPCError("CONFLICT", {
      message: "This booking has nothing left to invoice",
    });
  }

  /*
   * A confirmed charter keeps its status while a transfer is outstanding: the balance is owed
   * against a booking that already happened, and moving it back to PAYMENT_PENDING would
   * reopen a checkout that is long finished. Only a booking on its way to being paid for the
   * first time makes that move, and it must be a legal one.
   */
  const opensCheckout = current !== "CONFIRMED";
  if (opensCheckout) assertTransition(current, "PAYMENT_PENDING");

  // Mirrors what the card path books the same money as, so the two never disagree about
  // which instalment a payment row belongs to.
  const kind = opensCheckout
    ? row.quote.paymentPolicy.mode === "full"
      ? ("full" as const)
      : ("deposit" as const)
    : ("balance" as const);

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
        kind,
        amountMinor,
        currency: row.booking.currency,
      })
      .returning({ id: paymentSchedule.id });

    await tx.insert(payment).values({
      bookingId: input.bookingId,
      scheduleId: schedule?.id ?? null,
      kind,
      amountMinor,
      currency: row.booking.currency,
      status: "requires_payment",
      idempotencyKey: `invoice:${request.id}`,
    });

    if (opensCheckout) {
      await tx
        .update(booking)
        .set({ status: "PAYMENT_PENDING" })
        .where(and(eq(booking.id, input.bookingId), eq(booking.status, current)));
    }

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

  return present(created, opensCheckout ? "PAYMENT_PENDING" : current);
}

/** Settled money only: a payment that has not landed is not a payment. */
async function settledPaidMinor(db: Database, bookingId: string): Promise<number> {
  const rows = await db
    .select({ amountMinor: payment.amountMinor })
    .from(payment)
    .where(and(eq(payment.bookingId, bookingId), eq(payment.status, "succeeded")));

  return rows.reduce((total, item) => total + item.amountMinor, 0);
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
