import {
  SLOT_HOLDING_STATUSES,
  booking,
  payment,
  paymentSchedule,
} from "@yacht-charter/db/schema/booking";
import { quote } from "@yacht-charter/db/schema/quote";
import { and, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";

import type { Database } from "../context";
import { notifyBalanceDue, notifyHoldExpiring } from "./booking-email";
import { outstandingMinor } from "./checkout-amounts";

/**
 * How far ahead of the due date the first reminder goes out. Long enough that a bank transfer
 * still clears in time, which is the slowest way the money can arrive.
 */
const REMINDER_WINDOW_DAYS = 10;

/**
 * The second letter, for a balance the first one did not settle.
 *
 * Three days rather than one: a card pays instantly but a transfer does not, and a customer who
 * needs to move money has to be told while their bank can still do it. It is also the last point
 * at which asking for more time is a conversation rather than an apology.
 */
const FINAL_REMINDER_DAYS = 3;

/**
 * How far past the due date an installment may be and still earn the overdue notice.
 *
 * A bound is needed because the notice is new and every unpaid installment in the table is
 * eligible the first time this runs. Thirty days keeps that first batch to the ones ops would
 * chase anyway; anything older is a booking a human has already decided something about, and
 * mailing the customer about it months later would be the system talking over them.
 */
const OVERDUE_NOTICE_WINDOW_DAYS = 30;

/**
 * How long before an unpaid hold lapses the customer is told.
 *
 * Deliberately short. The hold is the operator's, its length is theirs to set, and real ones run
 * from about twenty hours to six days -- a window measured in days would mail some customers
 * before they had left the checkout and others after the yacht was gone. A day and a half is
 * inside the shortest hold we see and still leaves an evening and a morning to act.
 */
const HOLD_REMINDER_HOURS = 36;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReminderResult = {
  sent: number;
  /** Installments whose booking has no email on it — nothing to send to, and worth seeing. */
  skipped: number;
  /** Of `sent`, the second letter for a balance the first reminder did not settle. */
  finalSent: number;
  /** Of `sent`, notices for an installment whose date has already passed. */
  overdueSent: number;
  /** Of `sent`, warnings that an unpaid hold is about to be released. */
  holdSent: number;
};

/** Which of the three letters a row is owed, which decides the column that claims it. */
type Stage = "due_soon" | "final" | "overdue";

const STAGE_COLUMN = {
  due_soon: paymentSchedule.reminderSentAt,
  final: paymentSchedule.finalReminderSentAt,
  overdue: paymentSchedule.overdueNoticeSentAt,
} as const;

const STAGE_PATCH = {
  due_soon: (now: Date) => ({ reminderSentAt: now }),
  final: (now: Date) => ({ finalReminderSentAt: now }),
  overdue: (now: Date) => ({ overdueNoticeSentAt: now }),
} as const;

/**
 * Reminds customers of a balance falling due, and then that it has not been paid.
 *
 * A deposit-policy charter takes the rest weeks or months later, by which time the customer has
 * long left the site: without this the first they hear of the date is the day it passes, and the
 * first thing we do about it is cancel their holiday.
 *
 * Three letters, each sent at most once per installment, each with its own claim column. The
 * claim is written by the statement that selects the row, so two overlapping runs cannot both
 * mail it and a redelivery finds nothing to claim — the same compare-and-set the expiry sweeper
 * uses. A booking that settles between two stages simply stops being selected: `status` is read
 * fresh every run rather than the earlier letter deciding anything.
 */
export async function sendBalanceReminders(
  db: Database,
  now: Date = new Date(),
): Promise<ReminderResult> {
  const dueSoon = await mailStage(db, now, "due_soon");
  const final = await mailStage(db, now, "final");
  const overdue = await mailStage(db, now, "overdue");
  const hold = await mailExpiringHolds(db, now);

  return {
    sent: dueSoon.sent + final.sent + overdue.sent + hold.sent,
    skipped: dueSoon.skipped + final.skipped + overdue.skipped + hold.skipped,
    finalSent: final.sent,
    overdueSent: overdue.sent,
    holdSent: hold.sent,
  };
}

/** The window each letter selects on, as bounds against `due_at`. */
function windowFor(stage: Stage, now: Date) {
  switch (stage) {
    /*
     * An installment already past its date used to be ops' problem alone, on the grounds that a
     * cheerful "due soon" is the wrong mail for a charter that may have been settled by transfer
     * or is about to be cancelled. That reasoning holds for this letter, and is why the overdue
     * one is worded as a different mail rather than this one sent late.
     */
    case "due_soon":
      return { from: now, to: new Date(now.getTime() + REMINDER_WINDOW_DAYS * DAY_MS) };
    case "final":
      return { from: now, to: new Date(now.getTime() + FINAL_REMINDER_DAYS * DAY_MS) };
    case "overdue":
      return { from: new Date(now.getTime() - OVERDUE_NOTICE_WINDOW_DAYS * DAY_MS), to: now };
  }
}

async function mailStage(
  db: Database,
  now: Date,
  stage: Stage,
): Promise<{ sent: number; skipped: number }> {
  const window = windowFor(stage, now);
  const claimColumn = STAGE_COLUMN[stage];

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
        isNull(claimColumn),
        // Only a booking that is actually on. A cancelled one owes nothing.
        eq(booking.status, "CONFIRMED"),
        /*
         * A test reservation is not a customer. It has an address on it like any other
         * booking, and nothing else would stop this mailing whoever made it.
         */
        isNull(booking.excludedAt),
        gt(paymentSchedule.dueAt, window.from),
        lte(paymentSchedule.dueAt, window.to),
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
      .set(STAGE_PATCH[stage](now))
      .where(and(eq(paymentSchedule.id, row.scheduleId), isNull(claimColumn)))
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
      stage,
    });

    sent += 1;
  }

  return { sent, skipped };
}

/**
 * Warns a customer whose unpaid hold is about to be released.
 *
 * The expiry sweep releases these on `hold_expires_at` and says nothing, which is correct for
 * the sweep -- by the time it runs the yacht is gone and there is nothing for the customer to
 * do. The mail that was missing is this one, sent while the hold still stands.
 *
 * CONFIRMED is excluded through `hold_expires_at` rather than by status: a confirmed booking has
 * no hold left to lapse, and the statuses selected here are exactly the ones the sweep will act
 * on. Claimed on the booking the same way an installment is, so the warning goes out once even
 * if the hold is later extended and this runs again.
 */
async function mailExpiringHolds(
  db: Database,
  now: Date,
): Promise<{ sent: number; skipped: number }> {
  const horizon = new Date(now.getTime() + HOLD_REMINDER_HOURS * 60 * 60 * 1000);

  const expiring = await db
    .select({ booking, quote })
    .from(booking)
    .innerJoin(quote, eq(quote.id, booking.quoteId))
    .where(
      and(
        // Everything the hold sweep can reach, less the one that is already sold.
        inArray(
          booking.status,
          SLOT_HOLDING_STATUSES.filter((s) => s !== "CONFIRMED"),
        ),
        isNull(booking.holdReminderSentAt),
        isNull(booking.excludedAt),
        gt(booking.holdExpiresAt, now),
        lte(booking.holdExpiresAt, horizon),
      ),
    );

  let sent = 0;
  let skipped = 0;

  for (const row of expiring) {
    const holdExpiresAt = row.booking.holdExpiresAt;
    if (!row.booking.guestEmail || !holdExpiresAt) {
      skipped += 1;
      continue;
    }

    const settled = await db
      .select({ total: sql<number>`coalesce(sum(${payment.amountMinor}), 0)::int` })
      .from(payment)
      .where(and(eq(payment.bookingId, row.booking.id), eq(payment.status, "succeeded")));

    const paidMinor = settled[0]?.total ?? 0;
    const owed = outstandingMinor(row.quote, paidMinor);

    // Paid in full and still holding means the confirmation is in flight, not that the
    // customer forgot: there is nothing to finish and the mail would only alarm them.
    if (owed <= 0) {
      skipped += 1;
      continue;
    }

    const [claimed] = await db
      .update(booking)
      .set({ holdReminderSentAt: now })
      .where(and(eq(booking.id, row.booking.id), isNull(booking.holdReminderSentAt)))
      .returning({ id: booking.id });

    if (!claimed) continue;

    await notifyHoldExpiring({
      to: row.booking.guestEmail,
      guestName: row.booking.guestFullName ?? "Guest",
      bookingId: row.booking.id,
      reference: row.booking.reference,
      yachtName: row.booking.commercialSnapshot.listingTitle,
      outstandingMinor: owed,
      currency: row.quote.currency,
      holdExpiresAt,
      checkIn: row.quote.checkIn,
      checkOut: row.quote.checkOut,
    });

    sent += 1;
  }

  return { sent, skipped };
}
