import { booking, paymentSchedule } from "@yacht-charter/db/schema/booking";
import { quote } from "@yacht-charter/db/schema/quote";
import { and, eq, gt, isNull, lte } from "drizzle-orm";

import type { Database } from "../context";
import { notifyBalanceDue } from "./booking-email";

/**
 * How far ahead of the due date the reminder goes out. Long enough that a bank transfer still
 * clears in time, which is the slowest way the money can arrive.
 */
const REMINDER_WINDOW_DAYS = 10;

export type ReminderResult = {
  sent: number;
  /** Installments whose booking has no email on it — nothing to send to, and worth seeing. */
  skipped: number;
};

/**
 * Reminds customers of a balance falling due.
 *
 * A deposit-policy charter takes the rest weeks or months later, by which time the customer has
 * long left the site: without this the first they hear of the date is the day it passes, and the
 * first thing we do about it is cancel their holiday.
 *
 * Sends once per installment. `reminder_sent_at` is claimed in the statement that selects the
 * row, so two overlapping runs cannot both mail it and a redelivery finds nothing to claim —
 * the same compare-and-set the expiry sweeper uses.
 */
export async function sendBalanceReminders(
  db: Database,
  now: Date = new Date(),
): Promise<ReminderResult> {
  const horizon = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const due = await db
    .select({
      scheduleId: paymentSchedule.id,
      amountMinor: paymentSchedule.amountMinor,
      currency: paymentSchedule.currency,
      dueAt: paymentSchedule.dueAt,
      bookingId: booking.id,
      reference: booking.reference,
      guestEmail: booking.guestEmail,
      guestFullName: booking.guestFullName,
      snapshot: booking.commercialSnapshot,
      checkIn: quote.checkIn,
      checkOut: quote.checkOut,
    })
    .from(paymentSchedule)
    .innerJoin(booking, eq(booking.id, paymentSchedule.bookingId))
    .innerJoin(quote, eq(quote.id, booking.quoteId))
    .where(
      and(
        eq(paymentSchedule.kind, "balance"),
        eq(paymentSchedule.status, "pending"),
        isNull(paymentSchedule.reminderSentAt),
        // Only a booking that is actually on. A cancelled one owes nothing.
        eq(booking.status, "CONFIRMED"),
        lte(paymentSchedule.dueAt, horizon),
        /*
         * An installment already past its date is ops' problem, not a reminder's: the charter
         * may have been settled by transfer, rescheduled, or be about to be cancelled, and a
         * cheerful "due soon" is the wrong mail for any of those.
         */
        gt(paymentSchedule.dueAt, now),
      ),
    );

  let sent = 0;
  let skipped = 0;

  for (const row of due) {
    if (!row.guestEmail || !row.dueAt) {
      skipped += 1;
      continue;
    }

    // Claim first. A send that then fails is logged and not retried, which is the right way
    // round: a customer who gets no reminder still has the booking page, and one who gets the
    // same reminder every hour has a reason to distrust us.
    const [claimed] = await db
      .update(paymentSchedule)
      .set({ reminderSentAt: now })
      .where(and(eq(paymentSchedule.id, row.scheduleId), isNull(paymentSchedule.reminderSentAt)))
      .returning({ id: paymentSchedule.id });

    if (!claimed) continue;

    await notifyBalanceDue({
      to: row.guestEmail,
      guestName: row.guestFullName ?? "Guest",
      bookingId: row.bookingId,
      reference: row.reference,
      yachtName: row.snapshot.listingTitle,
      amountMinor: row.amountMinor,
      currency: row.currency,
      dueAt: row.dueAt,
      checkIn: row.checkIn,
      checkOut: row.checkOut,
    });

    sent += 1;
  }

  return { sent, skipped };
}
