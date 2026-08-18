import { crewTypeSchema, providerQuoteSchema } from "@yacht-charter/providers";
import { z } from "zod";

import { paymentScheduleKindSchema } from "./booking";
import { dateRangeRefinement, moneySchema } from "./primitives";

/**
 * The provider's quote plus our own id for it. `id` stays the provider's reference;
 * `quoteId` is what every later call (reprice, checkout) is keyed on, because only
 * our row is immutable and re-validatable.
 */
export const appliedAdjustmentSchema = z.object({
  source: z.enum(["rule", "discount"]),
  sourceId: z.string(),
  name: z.string(),
  type: z.enum(["percentage", "fixed_amount"]),
  valuePct: z.number().nullable(),
  valueMinor: z.number().int().nullable(),
  /** Signed delta in minor units; negative reduced the price. */
  amountMinor: z.number().int(),
});

/**
 * What the customer will be asked for and when, derived from the frozen quote.
 * A booking's own `payment_schedule` rows only exist once a card payment starts,
 * so until then this is the only thing the booking sidebar can render, and the
 * `deposit` entry is the same figure `checkout.confirm` charges.
 */
export const quotePaymentScheduleEntrySchema = z.object({
  kind: paymentScheduleKindSchema,
  amount: moneySchema,
  /** Null means due now; otherwise an ISO date. */
  dueAt: z.string().nullable(),
});

export const persistedQuoteSchema = providerQuoteSchema.extend({
  quoteId: z.string(),
  /** The total split across the party, for the "~€3,500 for person" line. */
  perPerson: moneySchema.nullable(),
  paymentSchedule: z.array(quotePaymentScheduleEntrySchema),
  discount: z
    .object({ code: z.string(), name: z.string(), amountMinor: z.number().int() })
    .nullable(),
  /**
   * Why a supplied code was not used. The quote is still priced, just without it,
   * so the checkout screen can explain rather than error.
   */
  discountRejected: z
    .enum([
      "unknown_code",
      "inactive",
      "not_started",
      "expired",
      "usage_limit_reached",
      "not_applicable",
    ])
    .nullable(),
  /** Referral credit absorbed by this quote, redeemed for real at checkout. */
  creditApplied: moneySchema.nullable(),
  /**
   * What the signed-in caller's balance could absorb here, applied or not. Null
   * for a visitor with no balance, and for a trip under the credit minimum.
   */
  creditAvailable: moneySchema.nullable(),
  /** Every rule and discount that moved the price, in the order applied. */
  adjustments: z.array(appliedAdjustmentSchema),
});

export type PersistedQuoteContract = z.infer<typeof persistedQuoteSchema>;

/**
 * The booking sidebar edits dates, guests and extras in place. Every field except
 * the id is optional: an omitted field keeps whatever the previous quote had.
 */
export const repriceInputSchema = z
  .object({
    quoteId: z.string().min(1),
    checkIn: z.iso.date().optional(),
    checkOut: z.iso.date().optional(),
    guests: z.coerce.number().int().positive().max(100).optional(),
    extras: z.array(z.string().min(1)).optional(),
    /** The sidebar's Crew control. Omitted keeps the previous quote's choice. */
    crewType: crewTypeSchema.optional(),
    /** Pass null to clear a previously applied code. */
    discountCode: z.string().trim().max(64).nullable().optional(),
    /** Spend available referral credit. Ignored for anonymous visitors. */
    applyCredit: z.boolean().optional(),
  })
  .superRefine(
    dateRangeRefinement("checkIn", "checkOut", "checkOut must be after checkIn", {
      exclusive: true,
    }),
  );
