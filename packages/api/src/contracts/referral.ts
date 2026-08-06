import { z } from "zod";

import { paginationSchema } from "./catalog";

export const referralCodeSchema = z.object({
  code: z.string(),
  /** Relative path the share link points at — the web app prefixes its own origin. */
  urlPath: z.string(),
});

export type ReferralCode = z.infer<typeof referralCodeSchema>;

export const referralClaimInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

export const referralClaimResultSchema = z.object({
  accepted: z.boolean(),
  code: z.string(),
  /** Null when accepted; otherwise why the claim was refused, for the signup toast. */
  reason: z.enum(["unknown_code", "own_code", "already_referred"]).nullable(),
});

export type ReferralClaimResult = z.infer<typeof referralClaimResultSchema>;

/* ------------------------------------------------------- summary and history */

const moneySchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().length(3),
});

/**
 * Everything the Referrals screen needs above the history table: the four stat
 * tiles and the whole "Your Level" card, in one call.
 */
export const referralSummarySchema = z.object({
  code: z.string(),
  urlPath: z.string(),
  /** People who used the code, whether or not they have sailed yet. */
  invitedCount: z.number().int(),
  /** Referrals that actually sailed and paid out. */
  completedBookingsCount: z.number().int(),
  totalEarned: moneySchema,
  availableBalance: moneySchema,
  tier: z.object({ code: z.string(), name: z.string(), level: z.number().int() }).nullable(),
  nextTier: z.object({ code: z.string(), name: z.string(), level: z.number().int() }).nullable(),
  /** Null at the top of the ladder, where there is nothing left to reach. */
  remainingToNext: z.number().int().nullable(),
  /** 0–100 for the progress bar. */
  progressPct: z.number().int(),
  perks: z.array(
    z.object({
      /** Matches an i18n key under Referrals.how.level.perks. */
      code: z.string(),
      label: z.string(),
      unlocked: z.boolean(),
    }),
  ),
});

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;

export const referralHistoryInputSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
    pageSize: z.coerce.number().int().min(1).max(50).default(DEFAULT_PAGE_SIZE),
  })
  .default({ page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE });

export const referralHistoryRowSchema = z.object({
  id: z.string(),
  /**
   * The invited person's display name. Only ever shown to the referrer, who
   * already knows who they invited.
   */
  referredUserName: z.string(),
  status: z.enum(["pending", "credited", "void"]),
  amount: moneySchema.nullable(),
  createdAt: z.string(),
  creditedAt: z.string().nullable(),
});

export const referralHistorySchema = z.object({
  items: z.array(referralHistoryRowSchema),
  pagination: paginationSchema,
});

/* ------------------------------------------------------------------ credits */

export const creditBalanceSchema = z.object({
  balance: moneySchema,
  /** Sum of credits expiring within the next 30 days, so the UI can warn. */
  expiringSoon: moneySchema,
});

export const creditLedgerInputSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .default({ page: DEFAULT_PAGE, pageSize: 20 });

export const creditLedgerSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["referral_reward", "booking_redemption", "expiry", "adjustment"]),
      amount: moneySchema,
      note: z.string().nullable(),
      bookingId: z.string().nullable(),
      expiresAt: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
  pagination: paginationSchema,
});
