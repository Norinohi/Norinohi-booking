import { booking, payment } from "@yacht-charter/db/schema/booking";
import { user } from "@yacht-charter/db/schema/auth";
import { quote } from "@yacht-charter/db/schema/quote";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  bookingAdminListInputSchema,
  bookingAdminListSchema,
  bookingAdminRowSchema,
} from "../contracts/booking";
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

export async function listBookingsForAdmin(db: Database, input: ListInput): Promise<ListResult> {
  const filters = [];
  if (input.status?.length) filters.push(inArray(booking.status, input.status));

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
    createdAt: row.booking.createdAt.toISOString(),
  };
}
