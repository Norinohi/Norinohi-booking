import { booking, payment } from "@yacht-charter/db/schema/booking";
import { quote } from "@yacht-charter/db/schema/quote";
import { and, eq } from "drizzle-orm";

import type { Database } from "../context";
import { notifyPaymentReceived } from "./booking-email";
import { outstandingMinor } from "./checkout-amounts";

/**
 * The receipt for one payment that has settled.
 *
 * Shared by the two ways money arrives, for the same reason `confirmBookingWithProvider` is:
 * a card charge lands through the Stripe webhook and a transfer through an admin settling an
 * invoice, and only one of them had anything to show for it. Stripe mails its own receipt for
 * a card, so a customer paying by transfer used to hear nothing at all between sending the
 * money and the charter being confirmed.
 *
 * Called after the payment row is `succeeded`, because that is what the totals here are read
 * from: sending before the update reports the booking as owing money it has already been paid.
 *
 * The method is a parameter rather than something to infer. Everything else in the codebase
 * reads it off the presence of a Stripe intent id, which is true but is the caller's fact, not
 * this function's.
 */
export async function announcePaymentReceived(
  db: Database,
  paymentId: string,
  method: "card" | "bank transfer",
): Promise<void> {
  const [found] = await db
    .select({ payment, booking, quote })
    .from(payment)
    .innerJoin(booking, eq(booking.id, payment.bookingId))
    .innerJoin(quote, eq(quote.id, booking.quoteId))
    .where(eq(payment.id, paymentId))
    .limit(1);

  // A guest checkout always leaves an address; a booking made some other way may not, and
  // there is nowhere to send a receipt to.
  if (!found?.booking.guestEmail) return;

  const settled = await db
    .select({ amountMinor: payment.amountMinor })
    .from(payment)
    .where(and(eq(payment.bookingId, found.booking.id), eq(payment.status, "succeeded")));

  const paidTotalMinor = settled.reduce((total, row) => total + row.amountMinor, 0);

  await notifyPaymentReceived({
    to: found.booking.guestEmail,
    guestName: found.booking.guestFullName ?? "Guest",
    bookingId: found.booking.id,
    reference: found.booking.reference,
    yachtName: found.booking.commercialSnapshot.listingTitle,
    amountMinor: found.payment.amountMinor,
    currency: found.payment.currency,
    // Written in the same statement that marked it succeeded; `now` only covers a row an
    // older code path settled without one.
    paidAt: found.payment.paidAt ?? new Date(),
    method,
    kind: found.payment.kind,
    totalMinor: found.quote.totalMinor,
    paidTotalMinor,
    outstandingMinor: outstandingMinor(found.quote, paidTotalMinor),
    balanceDueAt: found.quote.paymentPolicy.balanceDueAt ?? null,
  });
}
