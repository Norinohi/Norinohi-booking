import { profile } from "@yacht-charter/db/schema/account";
import { user } from "@yacht-charter/db/schema/auth";
import { booking } from "@yacht-charter/db/schema/booking";
import { and, asc, count, desc, eq, ilike, isNotNull, isNull, max, or, sql } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  userAdminListInputSchema,
  userAdminListSchema,
  userAdminRowSchema,
} from "../contracts/user-admin";
import { paginatedQuery, totalFrom } from "./pagination";

type ListInput = z.infer<typeof userAdminListInputSchema>;
type ListResult = z.infer<typeof userAdminListSchema>;
type Row = z.infer<typeof userAdminRowSchema>;

/*
 * The staff view of accounts: who they are, how to reach them, and how much they have booked.
 *
 * Booking counts leave out excluded bookings for the same reason the booking list does: a
 * customer whose only booking was a test against a vendor's sandbox company is not a customer
 * who has booked.
 */
export async function listUsersForAdmin(db: Database, input: ListInput): Promise<ListResult> {
  const counts = db
    .select({
      userId: booking.userId,
      total: count().as("booking_total"),
      confirmed: sql<number>`count(*) filter (where ${booking.status} = 'CONFIRMED')`.as(
        "booking_confirmed",
      ),
      lastAt: max(booking.createdAt).as("booking_last_at"),
    })
    .from(booking)
    .where(isNull(booking.excludedAt))
    .groupBy(booking.userId)
    .as("booking_counts");

  const phone = sql<string | null>`coalesce(${profile.phone}, ${user.phone})`;
  const bookingTotal = sql<number>`coalesce(${counts.total}, 0)`;

  const filters = [];

  if (input.query) {
    const term = `%${input.query}%`;
    const matches = [ilike(user.name, term), ilike(user.email, term), ilike(phone, term)];
    // A number is stored as the customer typed it, so "+385 91 234" and "38591234" have to
    // meet on their digits alone.
    const digits = input.query.replace(/\D/g, "");
    if (digits.length >= 3) {
      matches.push(sql`regexp_replace(${phone}, '\\D', '', 'g') like ${`%${digits}%`}`);
    }
    filters.push(or(...matches));
  }

  if (input.role) filters.push(eq(user.role, input.role));

  if (input.status === "deactivated") filters.push(isNotNull(user.deactivatedAt));
  if (input.status === "guest") {
    filters.push(isNull(user.deactivatedAt), isNotNull(user.provisionedAt));
  }
  if (input.status === "active") {
    filters.push(isNull(user.deactivatedAt), isNull(user.provisionedAt));
  }

  if (input.hasBookings === true) filters.push(sql`${bookingTotal} > 0`);
  if (input.hasBookings === false) filters.push(sql`${bookingTotal} = 0`);

  const where = filters.length > 0 ? and(...filters) : undefined;

  const order = {
    newest: [desc(user.createdAt), desc(user.id)],
    mostBookings: [desc(bookingTotal), desc(user.createdAt), desc(user.id)],
    name: [asc(user.name), asc(user.id)],
  }[input.sort];

  const { rows, pagination } = await paginatedQuery({
    page: input.page,
    pageSize: input.pageSize,
    rows: (limit, offset) =>
      db
        .select({
          user,
          phone,
          bookingTotal,
          confirmed: sql<number>`coalesce(${counts.confirmed}, 0)`,
          lastAt: counts.lastAt,
        })
        .from(user)
        .leftJoin(profile, eq(profile.userId, user.id))
        .leftJoin(counts, eq(counts.userId, user.id))
        .where(where)
        .orderBy(...order)
        .limit(limit)
        .offset(offset),
    total: async () =>
      totalFrom(
        await db
          .select({ totalItems: count() })
          .from(user)
          .leftJoin(profile, eq(profile.userId, user.id))
          .leftJoin(counts, eq(counts.userId, user.id))
          .where(where),
      ),
  });

  return { items: rows.map(present), pagination };
}

function present(row: {
  user: typeof user.$inferSelect;
  phone: string | null;
  bookingTotal: number;
  confirmed: number;
  lastAt: Date | null;
}): Row {
  return {
    id: row.user.id,
    name: row.user.name || null,
    email: row.user.email,
    emailVerified: row.user.emailVerified,
    phone: row.phone || null,
    role: row.user.role,
    status: row.user.deactivatedAt ? "deactivated" : row.user.provisionedAt ? "guest" : "active",
    // Counts come back from the driver as strings.
    bookingCount: Number(row.bookingTotal),
    confirmedBookingCount: Number(row.confirmed),
    lastBookingAt: row.lastAt ? new Date(row.lastAt).toISOString() : null,
    createdAt: row.user.createdAt.toISOString(),
  };
}
