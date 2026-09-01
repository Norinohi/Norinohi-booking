import { z } from "zod";

export const sweepResultSchema = z.object({
  /** Unconsumed quotes moved to `expired`. */
  quotesExpired: z.number().int(),
  /** Bookings whose provider hold lapsed, moved to OPTION_EXPIRED. */
  holdsExpired: z.number().int(),
  /** Bookings still waiting on a quote that ran out, moved to QUOTE_EXPIRED. */
  bookingsQuoteExpired: z.number().int(),
  /**
   * Checkouts abandoned in PAYMENT_PENDING past the cutoff, with no money in or on its way
   * and no invoice still within its terms. Nothing else moves that state, so until this ran
   * each one held its provider option against every future booking of the same slot.
   */
  paymentsAbandoned: z.number().int(),
  /**
   * Provider releases that failed. The booking expires either way — surfaced so ops
   * can check whether the provider is still holding a slot we think is free.
   */
  releaseFailures: z.array(
    z.object({
      bookingId: z.string(),
      message: z.string(),
    }),
  ),
  /** Listing view rows deleted past their retention window. */
  viewsPruned: z.number().int(),
  /**
   * Sync runs left in flight by a process that died, moved to `failed`. Non-zero means a
   * provider's syncs were blocked until this ran — worth looking at, not just counting.
   */
  syncRunsReaped: z.number().int(),
  /**
   * Bookings stuck in CONFIRMING, which the sweep reports but never moves: we cannot tell
   * whether the provider took the reservation, and both guesses cost real money. Anything
   * listed here is money held against a charter nobody has confirmed, and needs a human to
   * ask the provider. Non-empty is an alert, not a statistic.
   */
  staleConfirmations: z.array(
    z.object({
      bookingId: z.string(),
      reference: z.string(),
      stuckSince: z.string(),
    }),
  ),
});

export const reminderResultSchema = z.object({
  /** Balance installments a reminder went out for. Each is only ever mailed once. */
  sent: z.number().int(),
  /** Installments due but with no address on the booking — nothing to send to. */
  skipped: z.number().int(),
});

export const outboxDrainResultSchema = z.object({
  /** Messages delivered on this run. */
  sent: z.number().int(),
  /** Messages whose send failed and that are waiting out their backoff. Retried on their own. */
  retrying: z.number().int(),
  /**
   * Messages that ran out of attempts. Each one is a set-password invitation or a booking
   * confirmation a customer never received, and nothing will try again. Non-zero is an
   * alert, not a statistic.
   */
  failed: z.number().int(),
});

/**
 * What the operator has queued behind a week it has already sold.
 *
 * Support's question, not the customer's: nothing on the site offers to join a queue, because
 * doing so files something with the vendor on a customer's behalf and that decision has not
 * been taken. Empty where the booking's provider keeps no such queue.
 */
export const waitingOptionsInputSchema = z.object({
  listingId: z.string(),
  from: z.iso.date(),
  to: z.iso.date(),
});

export const waitingOptionsSchema = z.object({
  /** How many waiting options the operator holds for this boat and period. */
  count: z.number().int(),
  queue: z.array(z.object({ reservationId: z.string(), position: z.number().int() })),
  /** False when this vendor publishes no queue at all, which is not the same as an empty one. */
  supported: z.boolean(),
});
