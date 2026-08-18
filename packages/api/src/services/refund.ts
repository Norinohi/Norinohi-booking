import { ORPCError } from "@orpc/server";
import { booking, payment, paymentRefund, paymentSchedule } from "@yacht-charter/db/schema/booking";
import { and, eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";

import type { Database, DatabaseExecutor } from "../context";
import { type AuditMetadata, writeAuditLog } from "./audit";
import { notifyRefundIssued } from "./booking-email";
import { type BookingStatus, canTransition } from "./booking-state";
import { stripeClient } from "./payment";
import { allocate, type CardPaymentRow, type PaymentRow, planRefund } from "./refund-plan";

export type RefundResult = {
  bookingId: string;
  status: BookingStatus;
  /** Settled, not merely accepted by Stripe. */
  refunded: { amountMinor: number; currency: string };
  /** Refunds Stripe accepted but has not settled yet; `refund.updated` finishes these. */
  awaitingSettlement: number;
  /** Money that arrived by bank transfer, which no API call can send back. */
  requiresManualTransfer: number;
  /** Still owed back after this call, whether or not anyone has asked for it. */
  outstanding: { amountMinor: number; currency: string };
};

export type RefundOptions = {
  /**
   * Return only this much. Omitted returns everything collected — a cancellation policy that
   * retains a percentage is the reason this exists, and until one is modelled the figure is a
   * decision staff make and this records.
   */
  amountMinor?: number;
  reason?: string;
  manualTransferSettled?: boolean;
  actorUserId?: string;
};

/**
 * Returns the money on a booking that is owed a refund.
 *
 * REFUND_PENDING is where both the provider-rejection path and an admin
 * cancellation of a confirmed booking land, and until this ran that status was a
 * note to nobody — the state machine recorded the debt and nothing discharged it.
 *
 * Every refund is recorded before Stripe is called and keyed on that row, so a retry after a
 * timeout re-sends the same request rather than paying a second time, and a partial refund
 * can be topped up later without the two colliding.
 */
export async function refundBooking(
  db: Database,
  bookingId: string,
  options: RefundOptions = {},
): Promise<RefundResult> {
  const [row] = await db.select().from(booking).where(eq(booking.id, bookingId)).limit(1);

  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown booking" });

  const current = row.status;

  // Idempotent: a second call on a finished refund reports it rather than failing.
  if (current === "REFUNDED") {
    const plan = await readPlan(db, bookingId);
    return {
      bookingId,
      status: current,
      refunded: { amountMinor: plan.alreadyRefundedMinor, currency: row.currency },
      awaitingSettlement: 0,
      requiresManualTransfer: 0,
      outstanding: { amountMinor: plan.outstandingMinor, currency: row.currency },
    };
  }

  if (current !== "REFUND_PENDING") {
    throw new ORPCError("CONFLICT", {
      message: `A booking in ${current} owes no refund — cancel it first`,
    });
  }

  const plan = await readPlan(db, bookingId);

  if (options.amountMinor !== undefined && options.amountMinor > plan.outstandingMinor) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Only ${plan.outstandingMinor} is outstanding on this booking`,
    });
  }

  /*
   * Card money first. A partial refund that could have gone back through Stripe should not be
   * charged against a bank transfer nobody can automate, which is what allocating the manual
   * pile first would do.
   */
  const viaStripe = allocate(plan.viaStripe, options.amountMinor);
  const stripeShare = viaStripe.reduce((total, item) => total + item.outstandingMinor, 0);
  const manualRequest =
    options.amountMinor === undefined ? undefined : options.amountMinor - stripeShare;
  const manual = options.manualTransferSettled ? allocate(plan.manual, manualRequest) : [];

  let refundedMinor = plan.alreadyRefundedMinor;
  let awaitingSettlement = 0;

  if (viaStripe.length > 0) {
    const stripe = stripeClient();
    if (!stripe) {
      throw new ORPCError("NOT_IMPLEMENTED", {
        message: "Card refunds are not configured — set STRIPE_SECRET_KEY to enable them",
      });
    }

    for (const item of viaStripe) {
      const settled = await refundCard(
        db,
        stripe,
        item.payment,
        item.outstandingMinor,
        bookingId,
        options.reason,
      );

      if (settled) refundedMinor += item.outstandingMinor;
      else awaitingSettlement += 1;
    }
  }

  // Bank transfers leave the building the same way they arrived — by hand. The
  // flag is the admin saying they have sent it, which is the only evidence there is.
  for (const item of manual) {
    await db.transaction(async (tx) => {
      await tx.insert(paymentRefund).values({
        paymentId: item.payment.id,
        amountMinor: item.outstandingMinor,
        currency: item.payment.currency,
        status: "succeeded",
        reason: options.reason ?? null,
        settledAt: new Date(),
      });
      await settlePayment(tx, item.payment);
    });

    refundedMinor += item.outstandingMinor;
  }

  const after = await readPlan(db, bookingId);
  const status = await settleWhenFullyRefunded(db, bookingId);
  const outstandingManual = after.manual.length;

  if (options.actorUserId) {
    const metadata: AuditMetadata = {
      awaitingSettlement,
      requiresManualTransfer: outstandingManual,
      outstandingMinor: after.outstandingMinor,
    };
    if (options.reason) metadata.reason = options.reason;
    if (options.amountMinor !== undefined) metadata.requestedMinor = options.amountMinor;
    if (options.manualTransferSettled) metadata.manualTransferSettled = true;

    await writeAuditLog(db, {
      actorUserId: options.actorUserId,
      action: "update",
      entityType: "booking",
      entityId: bookingId,
      before: { status: current },
      after: { status, refundedMinor, currency: row.currency },
      metadata,
    });
  }

  /*
   * Only for money that has actually moved. A refund Stripe has accepted but not settled tells
   * the customer nothing they can check, and `refund.updated` is what closes those out — mailing
   * on acceptance would announce a refund that can still fail.
   */
  const settledNow = refundedMinor - plan.alreadyRefundedMinor;
  if (settledNow > 0 && row.guestEmail) {
    await notifyRefundIssued({
      to: row.guestEmail,
      guestName: row.guestFullName ?? "Guest",
      bookingId,
      reference: row.reference,
      yachtName: row.commercialSnapshot.listingTitle,
      refundedMinor: settledNow,
      outstandingMinor: after.outstandingMinor,
      currency: row.currency,
      reason: options.reason,
    });
  }

  return {
    bookingId,
    status,
    refunded: { amountMinor: refundedMinor, currency: row.currency },
    awaitingSettlement,
    requiresManualTransfer: outstandingManual,
    outstanding: { amountMinor: after.outstandingMinor, currency: row.currency },
  };
}

/**
 * Records the attempt, asks Stripe to reverse it, then files the answer. Returns whether the
 * money is actually back; anything Stripe still owns stays `pending` and `refund.updated`
 * closes it out, so the booking never claims money is back before it is.
 */
async function refundCard(
  db: Database,
  stripe: Stripe,
  paid: CardPaymentRow,
  amountMinor: number,
  bookingId: string,
  reason: string | undefined,
): Promise<boolean> {
  const [attempt] = await db
    .insert(paymentRefund)
    .values({
      paymentId: paid.id,
      amountMinor,
      currency: paid.currency,
      status: "pending",
      reason: reason ?? null,
    })
    .returning({ id: paymentRefund.id });

  if (!attempt) throw new ORPCError("INTERNAL_SERVER_ERROR");

  const metadata: Stripe.MetadataParam = { bookingId, paymentId: paid.id };
  if (reason) metadata.reason = reason;

  const refund = await stripe.refunds.create(
    { payment_intent: paid.stripePaymentIntentId, amount: amountMinor, metadata },
    /*
     * Keyed on our own attempt row, not the payment: a booking refunded in two parts needs two
     * Stripe refunds, and a retry after a timeout must re-send the one it was already given.
     */
    { idempotencyKey: `refund:${attempt.id}` },
  );

  if (refund.status === "succeeded") {
    await db.transaction(async (tx) => {
      await tx
        .update(paymentRefund)
        .set({ status: "succeeded", stripeRefundId: refund.id, settledAt: new Date() })
        .where(eq(paymentRefund.id, attempt.id));

      await settlePayment(tx, paid);
    });

    return true;
  }

  if (refund.status === "pending" || refund.status === "requires_action") {
    await db
      .update(paymentRefund)
      .set({ stripeRefundId: refund.id })
      .where(eq(paymentRefund.id, attempt.id));

    return false;
  }

  await db
    .update(paymentRefund)
    .set({
      status: "failed",
      stripeRefundId: refund.id,
      failureReason: refund.failure_reason ?? `Refund ${refund.status}`,
    })
    .where(eq(paymentRefund.id, attempt.id));

  await db
    .update(payment)
    .set({ failureReason: refund.failure_reason ?? `Refund ${refund.status}` })
    .where(eq(payment.id, paid.id));

  throw new ORPCError("BAD_GATEWAY", {
    message: `Stripe could not refund ${paid.id}: ${refund.failure_reason ?? refund.status}`,
  });
}

/**
 * Marks a payment refunded, but only once nothing is left on it. A part-returned payment stays
 * `succeeded`: `refunded` is what says the whole installment came back, and the schedule row
 * the customer reads takes its wording from it.
 */
export async function settlePayment(tx: DatabaseExecutor, paid: PaymentRow): Promise<void> {
  const refunds = await tx.select().from(paymentRefund).where(eq(paymentRefund.paymentId, paid.id));

  if (planRefund([paid], refunds).outstandingMinor > 0) return;

  await tx
    .update(payment)
    .set({ status: "refunded", refundedAt: new Date() })
    .where(eq(payment.id, paid.id));

  if (paid.scheduleId) {
    await tx
      .update(paymentSchedule)
      .set({ status: "refunded" })
      .where(eq(paymentSchedule.id, paid.scheduleId));
  }
}

/** The booking's payments and every refund recorded against them. */
async function readPlan(db: DatabaseExecutor, bookingId: string) {
  const payments = await db.select().from(payment).where(eq(payment.bookingId, bookingId));

  const refunds =
    payments.length === 0
      ? []
      : await db
          .select()
          .from(paymentRefund)
          .where(
            inArray(
              paymentRefund.paymentId,
              payments.map((row) => row.id),
            ),
          );

  return planRefund(payments, refunds);
}

/**
 * REFUND_PENDING → REFUNDED, but only once nothing is outstanding. A booking with
 * a refunded deposit and an unreturned balance is still owed money, and marking it
 * REFUNDED would close the only record that says so.
 */
export async function settleWhenFullyRefunded(
  db: Database,
  bookingId: string,
): Promise<BookingStatus> {
  const [row] = await db
    .select({ status: booking.status })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);

  const current = row?.status ?? "REFUND_PENDING";
  if (!canTransition(current, "REFUNDED")) return current;

  const plan = await readPlan(db, bookingId);
  if (plan.outstandingMinor > 0) return current;

  const [moved] = await db
    .update(booking)
    .set({ status: "REFUNDED" })
    .where(and(eq(booking.id, bookingId), eq(booking.status, current)))
    .returning({ status: booking.status });

  return moved?.status ?? current;
}
