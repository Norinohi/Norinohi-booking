import { z } from "zod";

export const sweepResultSchema = z.object({
  /** Unconsumed quotes moved to `expired`. */
  quotesExpired: z.number().int(),
  /** Bookings whose provider hold lapsed, moved to OPTION_EXPIRED. */
  holdsExpired: z.number().int(),
  /** Bookings still waiting on a quote that ran out, moved to QUOTE_EXPIRED. */
  bookingsQuoteExpired: z.number().int(),
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
});
