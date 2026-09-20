import { user } from "@yacht-charter/db/schema/auth";
import {
  booking,
  type CommercialSnapshot,
  payment,
  paymentRefund,
} from "@yacht-charter/db/schema/booking";
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  paymentAdminListInputSchema,
  paymentAdminListSchema,
  paymentAdminRowSchema,
} from "../contracts/booking";
import { paginatedQuery, totalFrom } from "./pagination";

/*
 * Every payment, across every booking.
 *
 * The invoice and refund queues next to this one are work to do, and each shows a
 * booking. This one shows payments, which is a different row: one booking can be a
 * deposit paid by card in March and a balance paid by transfer in June, and rolling
 * them into the booking would hide exactly the thing staff open this screen to see.
 */

type ListInput = z.infer<typeof paymentAdminListInputSchema>;
type ListResult = z.infer<typeof paymentAdminListSchema>;
type Row = z.infer<typeof paymentAdminRowSchema>;

export async function listPaymentsForAdmin(db: Database, input: ListInput): Promise<ListResult> {
  const filters = [];
  if (input.status?.length) filters.push(inArray(payment.status, input.status));
  if (input.kind?.length) filters.push(inArray(payment.kind, input.kind));
  // Same derivation the row presents, and the same one planRefund uses to decide what
  // it can send back: an intent means Stripe holds the money, its absence means a bank did.
  if (input.method === "card") filters.push(isNotNull(payment.stripePaymentIntentId));
  if (input.method === "transfer") filters.push(isNull(payment.stripePaymentIntentId));
  if (!input.includeExcluded) filters.push(isNull(booking.excludedAt));

  if (input.query) {
    const term = `%${input.query}%`;
    filters.push(
      or(ilike(booking.reference, term), ilike(user.name, term), ilike(user.email, term)),
    );
  }

  const where = filters.length > 0 ? and(...filters) : undefined;

  /*
   * Correlated rather than joined: a payment refunded in two parts would otherwise
   * appear twice and break both the page size and the count.
   */
  const refundedMinor = sql<number>`coalesce((
    select sum(${paymentRefund.amountMinor})
    from ${paymentRefund}
    where ${paymentRefund.paymentId} = ${payment.id}
      and ${paymentRefund.status} in ('pending', 'succeeded')
  ), 0)`;

  const scope = () =>
    db
      .select({ totalItems: count() })
      .from(payment)
      .innerJoin(booking, eq(booking.id, payment.bookingId))
      .innerJoin(user, eq(user.id, booking.userId))
      .where(where);

  const [{ rows, pagination }, totals] = await Promise.all([
    paginatedQuery({
      page: input.page,
      pageSize: input.pageSize,
      rows: (limit, offset) =>
        db
          .select({
            id: payment.id,
            bookingId: payment.bookingId,
            kind: payment.kind,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            status: payment.status,
            stripePaymentIntentId: payment.stripePaymentIntentId,
            failureReason: payment.failureReason,
            authorizedAt: payment.authorizedAt,
            paidAt: payment.paidAt,
            refundedAt: payment.refundedAt,
            disputedAt: payment.disputedAt,
            disputeStatus: payment.disputeStatus,
            createdAt: payment.createdAt,
            reference: booking.reference,
            bookingStatus: booking.status,
            commercialSnapshot: booking.commercialSnapshot,
            excludedAt: booking.excludedAt,
            customerName: user.name,
            customerEmail: user.email,
            refundedMinor,
          })
          .from(payment)
          .innerJoin(booking, eq(booking.id, payment.bookingId))
          .innerJoin(user, eq(user.id, booking.userId))
          .where(where)
          // createdAt, not paidAt: an authorized or failed payment has no paidAt, and
          // sorting those to one end is how they stop being noticed.
          .orderBy(desc(payment.createdAt), desc(payment.id))
          .limit(limit)
          .offset(offset),
      total: async () => totalFrom(await scope()),
    }),
    sumByCurrency(db, where),
  ]);

  return { items: rows.map(present), pagination, totals };
}

/**
 * The money behind the whole filter, per currency.
 *
 * Adding currencies together would be a reporting error rather than a rounding one, and
 * this marketplace quotes in whatever the operator sells in, so they stay apart. Only
 * `succeeded` counts as collected: an authorization is a hold on someone else's card.
 */
function sumByCurrency(db: Database, where: ReturnType<typeof and>) {
  const collectedMinor = sql<number>`coalesce(sum(
    case when ${payment.status} = 'succeeded' then ${payment.amountMinor} else 0 end
  ), 0)`;

  const refundedMinor = sql<number>`coalesce(sum((
    select coalesce(sum(${paymentRefund.amountMinor}), 0)
    from ${paymentRefund}
    where ${paymentRefund.paymentId} = ${payment.id}
      and ${paymentRefund.status} in ('pending', 'succeeded')
  )), 0)`;

  return db
    .select({
      currency: payment.currency,
      collectedMinor,
      refundedMinor,
      count: count(),
    })
    .from(payment)
    .innerJoin(booking, eq(booking.id, payment.bookingId))
    .innerJoin(user, eq(user.id, booking.userId))
    .where(where)
    .groupBy(payment.currency)
    .then((rows) =>
      rows.map((row) => ({
        currency: row.currency,
        collectedMinor: Number(row.collectedMinor),
        refundedMinor: Number(row.refundedMinor),
        count: row.count,
      })),
    );
}

function present(row: {
  id: string;
  bookingId: string;
  kind: Row["kind"];
  amountMinor: number;
  currency: string;
  status: Row["status"];
  stripePaymentIntentId: string | null;
  failureReason: string | null;
  authorizedAt: Date | null;
  paidAt: Date | null;
  refundedAt: Date | null;
  disputedAt: Date | null;
  disputeStatus: string | null;
  createdAt: Date;
  reference: string;
  bookingStatus: Row["bookingStatus"];
  commercialSnapshot: CommercialSnapshot;
  excludedAt: Date | null;
  customerName: string;
  customerEmail: string;
  refundedMinor: number;
}): Row {
  return {
    id: row.id,
    bookingId: row.bookingId,
    reference: row.reference,
    bookingStatus: row.bookingStatus,
    customerName: row.customerName || null,
    customerEmail: row.customerEmail,
    listingTitle: row.commercialSnapshot.listingTitle,
    kind: row.kind,
    amount: { amountMinor: row.amountMinor, currency: row.currency },
    status: row.status,
    method: row.stripePaymentIntentId ? "card" : "transfer",
    // The driver returns a numeric sum as a string; these are integer minor units,
    // so Number() on it is exact.
    refunded: { amountMinor: Number(row.refundedMinor), currency: row.currency },
    disputedAt: row.disputedAt?.toISOString() ?? null,
    disputeStatus: row.disputeStatus,
    failureReason: row.failureReason,
    authorizedAt: row.authorizedAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    refundedAt: row.refundedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    excludedAt: row.excludedAt?.toISOString() ?? null,
  };
}
