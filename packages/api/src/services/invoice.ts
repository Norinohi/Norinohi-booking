import { ORPCError } from "@orpc/server";
import { booking, payment, paymentSchedule } from "@yacht-charter/db/schema/booking";
import { invoiceRequest } from "@yacht-charter/db/schema/checkout";
import { listing } from "@yacht-charter/db/schema/listing";
import type { InventoryProvider } from "@yacht-charter/providers";
import { and, count, desc, eq } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  invoiceAdminRowSchema,
  invoiceListInputSchema,
  invoiceListSchema,
  invoiceSettleSchema,
} from "../contracts/booking";
import { writeAuditLog } from "./audit";
import { confirmBookingWithProvider } from "./booking-confirm";
import { paginatedQuery, totalFrom } from "./pagination";
type ListInput = z.infer<typeof invoiceListInputSchema>;

type ListResult = z.infer<typeof invoiceListSchema>;
type Row = z.infer<typeof invoiceAdminRowSchema>;
type SettleResult = z.infer<typeof invoiceSettleSchema>;

/**
 * The staff side of "Request invoice". Without this the whole bank-transfer path
 * dead-ends: the customer asks for an invoice, the booking sits at PAYMENT_PENDING,
 * and nothing in the system can ever complete it.
 */
export async function listInvoiceRequests(db: Database, input: ListInput): Promise<ListResult> {
  const where = input.status ? eq(invoiceRequest.status, input.status) : undefined;

  const { rows, pagination } = await paginatedQuery({
    page: input.page,
    pageSize: input.pageSize,
    rows: (limit, offset) =>
      db
        .select({ invoice: invoiceRequest, booking, listingTitle: listing.title })
        .from(invoiceRequest)
        .innerJoin(booking, eq(booking.id, invoiceRequest.bookingId))
        .innerJoin(listing, eq(listing.id, booking.listingId))
        .where(where)
        .orderBy(desc(invoiceRequest.createdAt), desc(invoiceRequest.id))
        .limit(limit)
        .offset(offset),
    total: async () =>
      totalFrom(await db.select({ totalItems: count() }).from(invoiceRequest).where(where)),
  });

  return {
    items: rows.map((row) => present(row.invoice, row.booking, row.listingTitle)),
    pagination,
  };
}

/**
 * Records that the transfer landed, then commits the booking with the provider
 * through exactly the same path a card payment takes.
 *
 * A provider refusal here is reported rather than thrown: the money has arrived,
 * so the settlement itself succeeded and the booking correctly ends up owing a
 * refund. Throwing would make staff think the transfer was not recorded.
 */
export async function settleInvoiceRequest(
  db: Database,
  provider: InventoryProvider,
  actorUserId: string,
  input: { id: string; amountMinor?: number; note?: string },
): Promise<SettleResult> {
  const [found] = await db
    .select({ invoice: invoiceRequest, booking, listingTitle: listing.title })
    .from(invoiceRequest)
    .innerJoin(booking, eq(booking.id, invoiceRequest.bookingId))
    .innerJoin(listing, eq(listing.id, booking.listingId))
    .where(eq(invoiceRequest.id, input.id))
    .limit(1);

  if (!found) throw new ORPCError("NOT_FOUND", { message: "Unknown invoice request" });

  if (found.invoice.status === "cancelled") {
    throw new ORPCError("CONFLICT", { message: "This invoice request was cancelled" });
  }

  const settledMinor = input.amountMinor ?? found.invoice.amountMinor;

  // Idempotent: settling twice must not double-record the payment or re-confirm.
  if (found.invoice.status !== "paid") {
    await db.transaction(async (tx) => {
      await tx
        .update(invoiceRequest)
        .set({ status: "paid", settledAt: new Date() })
        .where(and(eq(invoiceRequest.id, input.id), eq(invoiceRequest.status, "pending")));

      await tx
        .update(payment)
        .set({ status: "succeeded", paidAt: new Date() })
        .where(
          and(
            eq(payment.bookingId, found.invoice.bookingId),
            eq(payment.idempotencyKey, `invoice:${found.invoice.id}`),
          ),
        );

      await tx
        .update(paymentSchedule)
        .set({ status: "paid" })
        .where(
          and(
            eq(paymentSchedule.bookingId, found.invoice.bookingId),
            eq(paymentSchedule.status, "pending"),
          ),
        );

      await writeAuditLog(tx, {
        actorUserId,
        action: "update",
        entityType: "invoice_request",
        entityId: input.id,
        before: { status: found.invoice.status },
        after: { status: "paid", settledMinor },
        metadata: input.note ? { note: input.note } : undefined,
      });
    });
  }

  const outcome = await confirmBookingWithProvider(db, provider, found.invoice.bookingId);

  const [after] = await db
    .select({ invoice: invoiceRequest, booking, listingTitle: listing.title })
    .from(invoiceRequest)
    .innerJoin(booking, eq(booking.id, invoiceRequest.bookingId))
    .innerJoin(listing, eq(listing.id, booking.listingId))
    .where(eq(invoiceRequest.id, input.id))
    .limit(1);

  if (!after) throw new ORPCError("INTERNAL_SERVER_ERROR");

  return {
    invoice: present(after.invoice, after.booking, after.listingTitle),
    bookingStatus: after.booking.status,
    providerRejection: outcome.outcome === "rejected" ? outcome.message : null,
  };
}

/** Withdraws an invoice request and cancels the booking waiting on it. */
export async function cancelInvoiceRequest(
  db: Database,
  actorUserId: string,
  id: string,
  reason?: string,
): Promise<Row> {
  const [found] = await db
    .select({ invoice: invoiceRequest, booking, listingTitle: listing.title })
    .from(invoiceRequest)
    .innerJoin(booking, eq(booking.id, invoiceRequest.bookingId))
    .innerJoin(listing, eq(listing.id, booking.listingId))
    .where(eq(invoiceRequest.id, id))
    .limit(1);

  if (!found) throw new ORPCError("NOT_FOUND", { message: "Unknown invoice request" });

  if (found.invoice.status === "paid") {
    throw new ORPCError("CONFLICT", {
      message: "This invoice was already settled — cancel the booking instead",
    });
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(invoiceRequest)
      .set({ status: "cancelled" })
      .where(eq(invoiceRequest.id, id))
      .returning();

    await tx
      .update(payment)
      .set({ status: "failed", failureReason: reason ?? "Invoice request cancelled" })
      .where(
        and(
          eq(payment.bookingId, found.invoice.bookingId),
          eq(payment.idempotencyKey, `invoice:${found.invoice.id}`),
        ),
      );

    // The booking exists only because of this invoice; leaving it at
    // PAYMENT_PENDING would hold the provider option for nothing.
    await tx
      .update(booking)
      .set({ status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason ?? null })
      .where(and(eq(booking.id, found.invoice.bookingId), eq(booking.status, "PAYMENT_PENDING")));

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "invoice_request",
      entityId: id,
      before: { status: found.invoice.status },
      after: { status: "cancelled" },
      metadata: reason ? { reason } : undefined,
    });

    return row;
  });

  if (!updated) throw new ORPCError("INTERNAL_SERVER_ERROR");

  const [after] = await db
    .select({ status: booking.status })
    .from(booking)
    .where(eq(booking.id, found.invoice.bookingId))
    .limit(1);

  return present(
    updated,
    { ...found.booking, status: after?.status ?? found.booking.status },
    found.listingTitle,
  );
}

function present(
  invoice: typeof invoiceRequest.$inferSelect,
  bookingRow: typeof booking.$inferSelect,
  listingTitle: string,
): Row {
  return {
    id: invoice.id,
    bookingId: invoice.bookingId,
    number: invoice.number,
    issuedAt: invoice.issuedAt.toISOString(),
    dueAt: invoice.dueAt.toISOString(),
    billingEmail: invoice.billingEmail,
    billingName: invoice.billingName,
    companyName: invoice.companyName,
    vatNumber: invoice.vatNumber,
    registrationNumber: invoice.registrationNumber,
    addressLine1: invoice.addressLine1,
    addressLine2: invoice.addressLine2,
    city: invoice.city,
    postalCode: invoice.postalCode,
    countryCode: invoice.countryCode,
    amount: { amountMinor: invoice.amountMinor, currency: invoice.currency },
    status: invoice.status,
    bookingStatus: bookingRow.status,
    createdAt: invoice.createdAt.toISOString(),
    reference: bookingRow.reference,
    guestName: bookingRow.guestFullName,
    listingTitle,
    settledAt: invoice.settledAt?.toISOString() ?? null,
  };
}
