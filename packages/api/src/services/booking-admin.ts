import { ORPCError } from "@orpc/server";
import { booking, payment, paymentSchedule } from "@yacht-charter/db/schema/booking";
import { invoiceRequest } from "@yacht-charter/db/schema/checkout";
import { user } from "@yacht-charter/db/schema/auth";
import { quote } from "@yacht-charter/db/schema/quote";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  bookingAdminDetailSchema,
  bookingAdminListInputSchema,
  bookingAdminListSchema,
  bookingAdminRowSchema,
  bookingExcludeByCompanyInputSchema,
  bookingExcludeByCompanySchema,
  bookingExcludeInputSchema,
  bookingExcludeSchema,
} from "../contracts/booking";
import { writeAuditLog } from "./audit";
import { readAnyBooking } from "./booking-read";
import { paginatedQuery, totalFrom } from "./pagination";

/*
 * The staff view of bookings.
 *
 * Separate from listBookings in booking.ts because the two answer different questions:
 * that one is "my history", scoped to one user and dressed as listing cards, and this is
 * "what needs working on", across every user with the customer and the collected money
 * attached. Sharing a presenter would mean the customer screen carrying an email address
 * it must never show.
 */

type ListInput = z.infer<typeof bookingAdminListInputSchema>;
type ListResult = z.infer<typeof bookingAdminListSchema>;
type Row = z.infer<typeof bookingAdminRowSchema>;
type Detail = z.infer<typeof bookingAdminDetailSchema>;

export async function listBookingsForAdmin(db: Database, input: ListInput): Promise<ListResult> {
  const filters = [];
  if (input.status?.length) filters.push(inArray(booking.status, input.status));
  // Default, not an opt-out: a queue or a total that quietly counts test bookings
  // is wrong in a way nobody notices until the numbers are used for something.
  if (!input.includeExcluded) filters.push(isNull(booking.excludedAt));

  if (input.query) {
    const term = `%${input.query}%`;
    // `reference` is what a customer quotes on the phone; the other two are how staff
    // find someone who does not have it to hand.
    filters.push(
      or(ilike(booking.reference, term), ilike(user.name, term), ilike(user.email, term)),
    );
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  /*
   * Collected money is a sum over the payment rows, so it is a correlated subquery rather
   * than a join — joining would multiply the booking row once per payment and break both
   * the page size and the count.
   */
  const paidMinor = sql<number>`coalesce((
    select sum(${payment.amountMinor})
    from ${payment}
    where ${payment.bookingId} = ${booking.id} and ${payment.status} = 'succeeded'
  ), 0)`;

  const { rows, pagination } = await paginatedQuery({
    page: input.page,
    pageSize: input.pageSize,
    rows: (limit, offset) =>
      db
        .select({ booking, quote, customer: user, paidMinor })
        .from(booking)
        .innerJoin(quote, eq(quote.id, booking.quoteId))
        .innerJoin(user, eq(user.id, booking.userId))
        .where(where)
        .orderBy(desc(booking.createdAt), desc(booking.id))
        .limit(limit)
        .offset(offset),
    total: async () =>
      totalFrom(
        await db
          .select({ totalItems: count() })
          .from(booking)
          .innerJoin(user, eq(user.id, booking.userId))
          .where(where),
      ),
  });

  return { items: rows.map(present), pagination };
}

function present(row: {
  booking: typeof booking.$inferSelect;
  quote: typeof quote.$inferSelect;
  customer: typeof user.$inferSelect;
  paidMinor: number;
}): Row {
  return {
    id: row.booking.id,
    reference: row.booking.reference,
    status: row.booking.status,
    customerName: row.customer.name || null,
    customerEmail: row.customer.email,
    listingTitle: row.booking.commercialSnapshot.listingTitle,
    checkIn: row.quote.checkIn,
    checkOut: row.quote.checkOut,
    total: { amountMinor: row.quote.totalMinor, currency: row.quote.currency },
    // The driver hands a numeric sum back as a string, and Number() on it is exact:
    // these are integer minor units, never a decimal.
    paid: { amountMinor: Number(row.paidMinor), currency: row.quote.currency },
    cancelledAt: row.booking.cancelledAt?.toISOString() ?? null,
    cancelReason: row.booking.cancelReason,
    excludedAt: row.booking.excludedAt?.toISOString() ?? null,
    excludedReason: row.booking.excludedReason,
    createdAt: row.booking.createdAt.toISOString(),
  };
}

/**
 * One booking, for staff, regardless of who owns it.
 *
 * `readAnyBooking` rather than `readOwnedBooking` is the whole point: the customer endpoint
 * scopes to the session user and answers NOT_FOUND for anyone else, which is correct there and
 * is why staff could not open the bookings their own queues link to. The gate moves up to the
 * procedure — `adminProcedure` — instead of the query.
 */
export async function getBookingForAdmin(db: Database, id: string): Promise<Detail> {
  const row = await readAnyBooking(db, id);

  const [customer, schedules, payments, invoices] = await Promise.all([
    db.select().from(user).where(eq(user.id, row.booking.userId)).limit(1),
    db
      .select()
      .from(paymentSchedule)
      .where(eq(paymentSchedule.bookingId, id))
      .orderBy(asc(paymentSchedule.dueAt), asc(paymentSchedule.id)),
    db
      .select()
      .from(payment)
      .where(eq(payment.bookingId, id))
      .orderBy(asc(payment.createdAt), asc(payment.id)),
    db
      .select()
      .from(invoiceRequest)
      .where(eq(invoiceRequest.bookingId, id))
      .orderBy(desc(invoiceRequest.createdAt))
      .limit(1),
  ]);

  const owner = customer[0];
  if (!owner) throw new ORPCError("NOT_FOUND", { message: "Unknown booking" });

  const paidMinor = payments
    .filter((entry) => entry.status === "succeeded")
    .reduce((sum, entry) => sum + entry.amountMinor, 0);

  const snapshot = row.booking.commercialSnapshot;
  const invoice = invoices[0];

  return {
    ...present({ booking: row.booking, quote: row.quote, customer: owner, paidMinor }),
    provider: row.booking.provider,
    providerReservationId: row.booking.providerReservationId,
    holdExpiresAt: row.booking.holdExpiresAt?.toISOString() ?? null,
    confirmedAt: row.booking.confirmedAt?.toISOString() ?? null,
    crewType: row.quote.crewType,
    guests: row.quote.guests,
    // `provisionedAt` is stamped only by guest checkout and cleared the moment a password
    // is chosen, so it is the record of an account the customer never opened and still has
    // not claimed — which is what decides whether support can talk them through signing in
    // or has to send them a set-password link.
    isGuestAccount: owner.provisionedAt !== null,
    base: {
      name: snapshot.baseName,
      locationName: snapshot.locationName,
      countryName: snapshot.countryName,
    },
    priceLines: row.quote.lines.map((line) => ({
      code: line.code,
      label: line.label,
      amount: { amountMinor: line.amountMinor, currency: line.currency },
      group: line.group ?? null,
      payWhen: line.payWhen,
    })),
    paymentSchedule: schedules.map((schedule) => ({
      id: schedule.id,
      kind: schedule.kind,
      amount: { amountMinor: schedule.amountMinor, currency: schedule.currency },
      dueAt: schedule.dueAt?.toISOString() ?? null,
      status: schedule.status,
    })),
    payments: payments.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      amount: { amountMinor: entry.amountMinor, currency: entry.currency },
      status: entry.status,
      paidAt: entry.paidAt?.toISOString() ?? null,
      // Same test `planRefund` makes: an intent id is what a card payment is.
      method: entry.stripePaymentIntentId ? ("card" as const) : ("transfer" as const),
      disputedAt: entry.disputedAt?.toISOString() ?? null,
      disputeStatus: entry.disputeStatus,
    })),
    invoice: invoice
      ? {
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
          bookingStatus: row.booking.status,
          createdAt: invoice.createdAt.toISOString(),
        }
      : null,
  };
}

type ExcludeInput = z.infer<typeof bookingExcludeInputSchema>;
type ExcludeResult = z.infer<typeof bookingExcludeSchema>;
type ExcludeByCompanyInput = z.infer<typeof bookingExcludeByCompanyInputSchema>;
type ExcludeByCompanyResult = z.infer<typeof bookingExcludeByCompanySchema>;

/**
 * Marks one booking as not real business, or puts it back.
 *
 * Nothing about the booking's lifecycle moves: the status, the payments and the
 * provider reservation are left exactly as they are, and the customer-facing
 * paths never read this column. It only decides whether staff queues and money
 * totals count the row, which is why it is reversible and why cancelling is still
 * the right action for a booking that was real and is not happening.
 */
export async function setBookingExcluded(
  db: Database,
  input: ExcludeInput,
  actorUserId: string,
): Promise<ExcludeResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({
        id: booking.id,
        excludedAt: booking.excludedAt,
        excludedReason: booking.excludedReason,
      })
      .from(booking)
      .where(eq(booking.id, input.id))
      .limit(1);

    if (!existing) {
      throw new ORPCError("NOT_FOUND", { message: `Booking ${input.id} does not exist` });
    }

    const excludedAt = input.excluded ? new Date() : null;
    const excludedReason = input.excluded ? (input.reason ?? null) : null;

    await tx.update(booking).set({ excludedAt, excludedReason }).where(eq(booking.id, input.id));

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "booking",
      entityId: input.id,
      before: { excludedAt: existing.excludedAt?.toISOString() ?? null },
      after: { excludedAt: excludedAt?.toISOString() ?? null },
      ...(input.reason ? { metadata: { reason: input.reason } } : {}),
    });

    return {
      bookingId: input.id,
      excludedAt: excludedAt?.toISOString() ?? null,
      excludedReason,
    };
  });
}

/**
 * Excludes every booking taken against one charter company's yachts.
 *
 * The one action here that touches many rows, and the reason it exists: a test
 * charter company reaches production, someone books against it to prove the flow
 * works, and afterwards there is no way to say "none of that was real" without
 * clicking through each one.
 *
 * Scoped by the provider's own company id rather than by anything of ours,
 * because that is the identity the decision is actually about, and it keeps
 * working after the company's listings have been hidden by the import scope.
 *
 * Dry by default. `apply: false` reports exactly what would change and changes
 * nothing, so the size of the blast radius can be read before it goes off.
 */
export async function excludeBookingsByCompany(
  db: Database,
  input: ExcludeByCompanyInput,
  actorUserId: string,
): Promise<ExcludeByCompanyResult> {
  const matches = and(
    eq(booking.provider, input.provider),
    isNull(booking.excludedAt),
    sql`exists (
      select 1
      from ${listingSource}
      where ${listingSource.listingId} = ${booking.listingId}
        and ${listingSource.externalCompanyId} = ${input.externalCompanyId}
    )`,
  );

  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: booking.id, reference: booking.reference })
      .from(booking)
      .where(matches);

    const result = {
      provider: input.provider,
      externalCompanyId: input.externalCompanyId,
      applied: input.apply,
      matched: candidates.length,
      references: candidates.map((row) => row.reference),
    };

    if (!input.apply || candidates.length === 0) {
      return result;
    }

    await tx
      .update(booking)
      .set({ excludedAt: new Date(), excludedReason: input.reason ?? null })
      .where(
        inArray(
          booking.id,
          candidates.map((row) => row.id),
        ),
      );

    // One entry for the batch rather than one per booking: the decision was made
    // once, about a company, and a per-row log would bury that in the history.
    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "booking",
      before: { excluded: 0 },
      after: { excluded: candidates.length },
      metadata: {
        reason:
          input.reason ??
          `Bookings against ${input.provider} charter company ${input.externalCompanyId}`,
      },
    });

    return result;
  });
}
