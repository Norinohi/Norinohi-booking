import { referral, referralRedemption } from "@yacht-charter/db/schema/account";
import { user } from "@yacht-charter/db/schema/auth";
import { creditLedger } from "@yacht-charter/db/schema/loyalty";
import { and, count, desc, eq, gt, isNotNull, lte, sum } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  creditBalanceSchema,
  creditLedgerInputSchema,
  creditLedgerSchema,
  referralHistoryInputSchema,
  referralHistorySchema,
  referralSummarySchema,
} from "../contracts/referral";
import {
  CREDIT_CURRENCY,
  creditBalanceMinor,
  invitedCount,
  projectedRewardMinor,
  tierProgress,
  totalEarnedMinor,
} from "./loyalty";
import { paginatedQuery, paginationFor, totalFrom } from "./pagination";
import { getOrCreateReferralCode } from "./referral";
type Summary = z.infer<typeof referralSummarySchema>;

type HistoryInput = z.infer<typeof referralHistoryInputSchema>;
type History = z.infer<typeof referralHistorySchema>;
type Balance = z.infer<typeof creditBalanceSchema>;
type LedgerInput = z.infer<typeof creditLedgerInputSchema>;
type Ledger = z.infer<typeof creditLedgerSchema>;

const EXPIRING_SOON_DAYS = 30;

/** One call for the whole Referrals screen above the history table. */
export async function referralSummary(db: Database, userId: string): Promise<Summary> {
  const [code, invited, earned, balance, progress] = await Promise.all([
    getOrCreateReferralCode(db, userId),
    invitedCount(db, userId),
    totalEarnedMinor(db, userId, CREDIT_CURRENCY),
    creditBalanceMinor(db, userId, CREDIT_CURRENCY),
    tierProgress(db, userId),
  ]);

  return {
    code: code.code,
    urlPath: code.urlPath,
    invitedCount: invited,
    completedBookingsCount: progress.completedBookings,
    totalEarned: { amountMinor: earned, currency: CREDIT_CURRENCY },
    availableBalance: { amountMinor: balance, currency: CREDIT_CURRENCY },
    tier: progress.tier,
    nextTier: progress.nextTier,
    remainingToNext: progress.remainingToNext,
    progressPct: progress.progressPct,
    perks: progress.perks,
  };
}

export async function referralHistory(
  db: Database,
  userId: string,
  input: HistoryInput,
): Promise<History> {
  const [own] = await db
    .select({ id: referral.id })
    .from(referral)
    .where(eq(referral.userId, userId))
    .limit(1);

  if (!own) {
    return { items: [], pagination: paginationFor({ ...input, totalItems: 0, itemCount: 0 }) };
  }

  const where = eq(referralRedemption.referralId, own.id);

  const { rows, pagination } = await paginatedQuery({
    page: input.page,
    pageSize: input.pageSize,
    rows: (limit, offset) =>
      db
        .select({
          id: referralRedemption.id,
          status: referralRedemption.status,
          createdAt: referralRedemption.createdAt,
          creditedAt: referralRedemption.creditedAt,
          name: user.name,
          rewardMinor: creditLedger.amountMinor,
          rewardCurrency: creditLedger.currency,
        })
        .from(referralRedemption)
        .innerJoin(user, eq(user.id, referralRedemption.referredUserId))
        .leftJoin(creditLedger, eq(creditLedger.referralRedemptionId, referralRedemption.id))
        .where(where)
        .orderBy(desc(referralRedemption.createdAt), desc(referralRedemption.id))
        .limit(limit)
        .offset(offset),
    total: async () =>
      totalFrom(await db.select({ totalItems: count() }).from(referralRedemption).where(where)),
  });

  /*
   * A pending referral has no ledger row yet, but the screen still shows what it
   * is worth. Computed once per page rather than per row — every pending row on
   * it projects the same reward, since they share one referrer.
   */
  const projected = rows.some((row) => row.status === "pending")
    ? await projectedRewardMinor(db, userId)
    : 0;

  const items = rows.map((row) => ({
    id: row.id,
    referredUserName: row.name,
    status: row.status,
    amount: amountFor(row, projected),
    createdAt: row.createdAt.toISOString(),
    creditedAt: row.creditedAt?.toISOString() ?? null,
  }));

  return { items, pagination };
}

/**
 * Credited rows report what the ledger actually paid; pending rows report the
 * projection. A voided referral pays nothing and never will, so it reports null
 * rather than dangling an amount the user cannot collect.
 */
function amountFor(
  row: {
    status: "pending" | "credited" | "void";
    rewardMinor: number | null;
    rewardCurrency: string | null;
  },
  projectedMinor: number,
): { amountMinor: number; currency: string } | null {
  if (row.rewardMinor !== null) {
    return { amountMinor: row.rewardMinor, currency: row.rewardCurrency ?? CREDIT_CURRENCY };
  }

  return row.status === "pending"
    ? { amountMinor: projectedMinor, currency: CREDIT_CURRENCY }
    : null;
}

export async function creditBalance(db: Database, userId: string): Promise<Balance> {
  const soon = new Date();
  soon.setDate(soon.getDate() + EXPIRING_SOON_DAYS);

  const [balance, [expiring]] = await Promise.all([
    creditBalanceMinor(db, userId, CREDIT_CURRENCY),
    db
      .select({ total: sum(creditLedger.amountMinor) })
      .from(creditLedger)
      .where(
        and(
          eq(creditLedger.userId, userId),
          eq(creditLedger.currency, CREDIT_CURRENCY),
          isNotNull(creditLedger.expiresAt),
          gt(creditLedger.expiresAt, new Date()),
          lte(creditLedger.expiresAt, soon),
        ),
      ),
  ]);

  return {
    balance: { amountMinor: balance, currency: CREDIT_CURRENCY },
    expiringSoon: { amountMinor: Number(expiring?.total ?? 0), currency: CREDIT_CURRENCY },
  };
}

export async function creditLedgerEntries(
  db: Database,
  userId: string,
  input: LedgerInput,
): Promise<Ledger> {
  const where = eq(creditLedger.userId, userId);

  const { rows, pagination } = await paginatedQuery({
    page: input.page,
    pageSize: input.pageSize,
    rows: (limit, offset) =>
      db
        .select()
        .from(creditLedger)
        .where(where)
        .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id))
        .limit(limit)
        .offset(offset),
    total: async () =>
      totalFrom(await db.select({ totalItems: count() }).from(creditLedger).where(where)),
  });

  const items = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    amount: { amountMinor: row.amountMinor, currency: row.currency },
    note: row.note,
    bookingId: row.bookingId,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));

  return { items, pagination };
}
