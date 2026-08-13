import { ORPCError } from "@orpc/server";
import { booking, payment, paymentSchedule } from "@yacht-charter/db/schema/booking";
import { and, eq, isNull } from "drizzle-orm";
import type Stripe from "stripe";

import type { Database } from "../context";
import { type AuditMetadata, writeAuditLog } from "./audit";
import { type BookingStatus, canTransition } from "./booking-state";
import { stripeClient } from "./payment";
import { type CardPaymentRow, type PaymentRow, planRefund } from "./refund-plan";

export type RefundResult = {
  bookingId: string;
  status: BookingStatus;
  /** Settled, not merely accepted by Stripe. */
  refunded: { amountMinor: number; currency: string };
  /** Refunds Stripe accepted but has not settled yet; `refund.updated` finishes these. */
  awaitingSettlement: number;
  /** Money that arrived by bank transfer, which no API call can send back. */
  requiresManualTransfer: number;
};

/**
 * Returns the money on a booking that is owed a refund.
 *
 * REFUND_PENDING is where both the provider-rejection path and an admin
 * cancellation of a confirmed booking land, and until this ran that status was a
 * note to nobody — the state machine recorded the debt and nothing discharged it.
 *
 * Refunds are per payment and idempotency-keyed, so running this twice on a
 * partially-refunded booking finishes the job rather than paying twice.
 */
export async function refundBooking(
  db: Database,
  bookingId: string,
  options: { reason?: string; manualTransferSettled?: boolean; actorUserId?: string } = {},
): Promise<RefundResult> {
  const [row] = await db.select().from(booking).where(eq(booking.id, bookingId)).limit(1);

  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown booking" });

  const current = row.status;

  // Idempotent: a second call on a finished refund reports it rather than failing.
  if (current === "REFUNDED") {
    const settled = await db.select().from(payment).where(eq(payment.bookingId, bookingId));
    return {
      bookingId,
      status: current,
      refunded: {
        amountMinor: planRefund(settled).alreadyRefundedMinor,
        currency: row.currency,
      },
      awaitingSettlement: 0,
      requiresManualTransfer: 0,
    };
  }

  if (current !== "REFUND_PENDING") {
    throw new ORPCError("CONFLICT", {
      message: `A booking in ${current} owes no refund — cancel it first`,
    });
  }

  const plan = planRefund(await db.select().from(payment).where(eq(payment.bookingId, bookingId)));

  let refundedMinor = plan.alreadyRefundedMinor;
  let awaitingSettlement = 0;

  if (plan.viaStripe.length > 0) {
    const stripe = stripeClient();
    if (!stripe) {
      throw new ORPCError("NOT_IMPLEMENTED", {
        message: "Card refunds are not configured — set STRIPE_SECRET_KEY to enable them",
      });
    }

    for (const paid of plan.viaStripe) {
      const refund = await createRefund(stripe, paid, bookingId, options.reason);

      if (refund.status === "succeeded") {
        await markRefunded(db, paid);
        refundedMinor += paid.amountMinor;
      } else if (refund.status === "pending" || refund.status === "requires_action") {
        // Stripe owns the rest. `refund.updated` closes it out, and the booking
        // stays at REFUND_PENDING until then rather than claiming money is back.
        awaitingSettlement += 1;
      } else {
        await db
          .update(payment)
          .set({ failureReason: refund.failure_reason ?? `Refund ${refund.status}` })
          .where(eq(payment.id, paid.id));

        throw new ORPCError("BAD_GATEWAY", {
          message: `Stripe could not refund ${paid.id}: ${refund.failure_reason ?? refund.status}`,
        });
      }
    }
  }

  // Bank transfers leave the building the same way they arrived — by hand. The
  // flag is the admin saying they have sent it, which is the only evidence there is.
  if (options.manualTransferSettled) {
    for (const paid of plan.manual) {
      await markRefunded(db, paid);
      refundedMinor += paid.amountMinor;
    }
  }

  const outstandingManual = options.manualTransferSettled ? 0 : plan.manual.length;

  const status = await settleWhenFullyRefunded(db, bookingId);

  if (options.actorUserId) {
    const metadata: AuditMetadata = {
      awaitingSettlement,
      requiresManualTransfer: outstandingManual,
    };
    if (options.reason) metadata.reason = options.reason;
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

  return {
    bookingId,
    status,
    refunded: { amountMinor: refundedMinor, currency: row.currency },
    awaitingSettlement,
    requiresManualTransfer: outstandingManual,
  };
}

function createRefund(
  stripe: Stripe,
  paid: CardPaymentRow,
  bookingId: string,
  reason: string | undefined,
): Promise<Stripe.Refund> {
  const metadata: Stripe.MetadataParam = { bookingId, paymentId: paid.id };
  if (reason) metadata.reason = reason;

  return stripe.refunds.create(
    {
      payment_intent: paid.stripePaymentIntentId,
      // No `amount`: the whole payment goes back. Partial refunds are a
      // cancellation-policy decision nothing in the system makes yet.
      metadata,
    },
    // Keyed on the payment, not the booking: a booking with a deposit and a
    // balance needs two refunds, and a retry after a timeout must not add a third.
    { idempotencyKey: `refund:${paid.id}` },
  );
}

/** The payment and the installment it settled, moved together. */
async function markRefunded(db: Database, paid: PaymentRow): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(payment)
      .set({ status: "refunded", refundedAt: new Date() })
      .where(and(eq(payment.id, paid.id), isNull(payment.refundedAt)));

    if (paid.scheduleId) {
      await tx
        .update(paymentSchedule)
        .set({ status: "refunded" })
        .where(eq(paymentSchedule.id, paid.scheduleId));
    }
  });
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

  const plan = planRefund(await db.select().from(payment).where(eq(payment.bookingId, bookingId)));
  if (plan.viaStripe.length > 0 || plan.manual.length > 0) return current;

  const [moved] = await db
    .update(booking)
    .set({ status: "REFUNDED" })
    .where(and(eq(booking.id, bookingId), eq(booking.status, current)))
    .returning({ status: booking.status });

  return moved?.status ?? current;
}
