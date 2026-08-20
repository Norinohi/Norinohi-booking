import { user } from "@yacht-charter/db/schema/auth";
import { booking, payment } from "@yacht-charter/db/schema/booking";
import { quote } from "@yacht-charter/db/schema/quote";
import { and, eq } from "drizzle-orm";

import type { Database } from "../context";
import { notifyBookingReceived } from "./booking-email";
import { BOOKING_RECEIVED_STATES, type BookingStatus } from "./booking-state";
import { outstandingMinor } from "./checkout-amounts";

/**
 * The "we have your booking" mail, sent from the outbox rather than from `createHold`.
 *
 * Reading the booking here instead of carrying it through the queue is what makes a
 * retry safe to be late: an attempt that lands after the hold was extended, or after the
 * price was corrected, describes the booking as it stands rather than as it was when the
 * customer pressed the button.
 */
export async function sendBookingReceivedNotice(db: Database, bookingId: string): Promise<void> {
  const [found] = await db
    .select({ booking, quote, ownerProvisionedAt: user.provisionedAt })
    .from(booking)
    .innerJoin(quote, eq(quote.id, booking.quoteId))
    .innerJoin(user, eq(user.id, booking.userId))
    .where(eq(booking.id, bookingId))
    .limit(1);

  // A guest checkout always leaves an address; a booking made some other way may not, and
  // there is nowhere to send this to.
  if (!found?.booking.guestEmail) return;
  if (!(await stillDescribes(db, found.booking))) return;

  await notifyBookingReceived({
    to: found.booking.guestEmail,
    guestName: found.booking.guestFullName ?? "Guest",
    bookingId: found.booking.id,
    reference: found.booking.reference,
    snapshot: found.booking.commercialSnapshot,
    priced: found.quote,
    // Nothing has been collected yet at this point in checkout — the mail exists to say so,
    // and `stillDescribes` has just established that it is still true.
    outstandingMinor: outstandingMinor(found.quote, 0),
    holdExpiresAt: found.booking.holdExpiresAt,
    /*
     * Whether the account still has no password, not whether this checkout had a session.
     * A customer who has an account and simply did not sign in books through the guest
     * path and gets a booking-scoped token, so the token says nothing about a password;
     * `provisionedAt` is stamped only by guest provisioning and cleared the moment one is
     * chosen, which is the same test the invitation mail makes before it sends.
     */
    isGuest: found.ownerProvisionedAt !== null,
  });
}

/**
 * Whether the mail is still about something true.
 *
 * On the normal path the drain runs a second after the response and this always passes.
 * It exists for the retry: a message that spent the afternoon working through its backoff
 * would otherwise arrive at a charter that has since been paid for, confirmed or cancelled,
 * saying nothing has been charged and offering a payment link — and the confirmation and
 * receipt mails will already have told that customer the truth.
 *
 * Returning false rather than throwing is the point. There is nothing to retry: the moment
 * this mail described is gone, and the outbox should record it as done and move on.
 */
async function stillDescribes(
  db: Database,
  row: { id: string; status: BookingStatus },
): Promise<boolean> {
  const describable: readonly BookingStatus[] = BOOKING_RECEIVED_STATES;
  if (!describable.includes(row.status)) return false;

  // Money that arrived while the message waited. The status alone does not cover it: a
  // booking sits in PAYMENT_PENDING from the moment Pay is pressed until the provider
  // answers, and a succeeded payment inside that window makes "nothing has been charged"
  // false while the state is still one this mail is written for.
  const [settled] = await db
    .select({ id: payment.id })
    .from(payment)
    .where(and(eq(payment.bookingId, row.id), eq(payment.status, "succeeded")))
    .limit(1);

  return !settled;
}
