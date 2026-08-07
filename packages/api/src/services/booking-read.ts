import { ORPCError } from "@orpc/server";
import { booking } from "@yacht-charter/db/schema/booking";
import { quote } from "@yacht-charter/db/schema/quote";
import { type SQL, and, eq } from "drizzle-orm";

import type { DatabaseExecutor } from "../context";

/*
 * A booking is never useful without the quote it was priced from — every caller
 * needs both to say what is owed — so the join is the unit, not the booking row.
 */

export type BookingWithQuote = {
  booking: typeof booking.$inferSelect;
  quote: typeof quote.$inferSelect;
};

// Takes the predicates rather than a prebuilt clause so the where can never
// collapse to undefined and quietly return someone else's booking.
async function read(db: DatabaseExecutor, ...where: [SQL, ...SQL[]]): Promise<BookingWithQuote> {
  const [row] = await db
    .select({ booking, quote })
    .from(booking)
    .innerJoin(quote, eq(quote.id, booking.quoteId))
    .where(and(...where))
    .limit(1);

  // Deliberately NOT_FOUND rather than FORBIDDEN: another user's booking id should
  // not be confirmable by probing.
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown booking" });
  return row;
}

/** The customer's own booking. Someone else's reads as missing, not forbidden. */
export function readOwnedBooking(
  db: DatabaseExecutor,
  userId: string,
  bookingId: string,
): Promise<BookingWithQuote> {
  return read(db, eq(booking.id, bookingId), eq(booking.userId, userId));
}

/** Any booking, regardless of owner — admin paths only. */
export function readAnyBooking(db: DatabaseExecutor, bookingId: string): Promise<BookingWithQuote> {
  return read(db, eq(booking.id, bookingId));
}
