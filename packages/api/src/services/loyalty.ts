import { referral, referralRedemption } from "@yacht-charter/db/schema/account";
import { creditLedger, loyaltyPerk, loyaltyTier } from "@yacht-charter/db/schema/loyalty";
import { and, asc, count, eq, gt, isNull, or, sql, sum } from "drizzle-orm";

import type { Database, DatabaseExecutor } from "../context";

/*
 * Referral rewards and the loyalty ladder.
 *
 * The rules come from the copy on the Referrals screen:
 *   "€100 credit for yourself when they sail"
 *   "Once they complete their trip, you receive €100 credits"
 *   "Referral credits expire 12 months after being earned"
 *   "5% extra credit on all referrals" (a Navigator perk)
 */

const BASE_REWARD_MINOR = 10_000;
const REWARD_CURRENCY = "EUR";
const CREDIT_TTL_MONTHS = 12;

export type TierProgress = {
  tier: { code: string; name: string; level: number } | null;
  nextTier: { code: string; name: string; level: number } | null;
  completedBookings: number;
  requiredForNext: number | null;
  remainingToNext: number | null;
  /** 0–100, for the progress bar. 100 once the top tier is reached. */
  progressPct: number;
  perks: { code: string; label: string; unlocked: boolean }[];
};

/** Unexpired balance. Summed from the ledger so it can never drift from its entries. */
export async function creditBalanceMinor(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(creditLedger.amountMinor) })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.userId, userId),
        or(isNull(creditLedger.expiresAt), gt(creditLedger.expiresAt, new Date())),
      ),
    );

  return Number(row?.total ?? 0);
}

/** Everything ever earned, ignoring what has since been spent or expired. */
export async function totalEarnedMinor(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sum(creditLedger.amountMinor) })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.userId, userId),
        sql`${creditLedger.amountMinor} > 0`,
        eq(creditLedger.kind, "referral_reward"),
      ),
    );

  return Number(row?.total ?? 0);
}

/**
 * Where the user sits on the ladder, from how many of their referrals have
 * actually sailed. Returns an empty progression when no tiers are seeded rather
 * than throwing — the screen degrades, it does not break.
 */
export async function tierProgress(db: Database, userId: string): Promise<TierProgress> {
  const [tiers, completed] = await Promise.all([
    db.select().from(loyaltyTier).orderBy(asc(loyaltyTier.level)),
    completedReferralBookings(db, userId),
  ]);

  if (tiers.length === 0) {
    return {
      tier: null,
      nextTier: null,
      completedBookings: completed,
      requiredForNext: null,
      remainingToNext: null,
      progressPct: 0,
      perks: [],
    };
  }

  const earned = tiers.filter((tier) => completed >= tier.requiredBookings);
  const current = earned.at(-1) ?? tiers[0];
  const next = tiers.find((tier) => tier.level > (current?.level ?? 0)) ?? null;

  const perkRows = await db
    .select({
      code: loyaltyPerk.code,
      label: loyaltyPerk.label,
      tierLevel: loyaltyTier.level,
      sortOrder: loyaltyPerk.sortOrder,
    })
    .from(loyaltyPerk)
    .innerJoin(loyaltyTier, eq(loyaltyTier.id, loyaltyPerk.tierId))
    .orderBy(asc(loyaltyTier.level), asc(loyaltyPerk.sortOrder));

  // The card lists every perk in the programme and ticks the ones reached, so a
  // locked perk is visible as something to aim at.
  const perks = perkRows.map((perk) => ({
    code: perk.code,
    label: perk.label,
    unlocked: (current?.level ?? 0) >= perk.tierLevel,
  }));

  const floor = current?.requiredBookings ?? 0;
  const ceiling = next?.requiredBookings ?? null;
  const span = ceiling === null ? 0 : Math.max(ceiling - floor, 1);

  return {
    tier: current ? { code: current.code, name: current.name, level: current.level } : null,
    nextTier: next ? { code: next.code, name: next.name, level: next.level } : null,
    completedBookings: completed,
    requiredForNext: ceiling,
    remainingToNext: ceiling === null ? null : Math.max(ceiling - completed, 0),
    progressPct:
      ceiling === null ? 100 : Math.min(Math.round(((completed - floor) / span) * 100), 100),
    perks,
  };
}

/** Referrals of this user that have been credited, i.e. the friend actually sailed. */
export async function completedReferralBookings(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(referralRedemption)
    .innerJoin(referral, eq(referral.id, referralRedemption.referralId))
    .where(and(eq(referral.userId, userId), eq(referralRedemption.status, "credited")));

  return row?.total ?? 0;
}

/**
 * Credits the referrer once an invitee's booking is confirmed — "once they
 * complete their trip, you receive €100 credits".
 *
 * Called from the booking-confirmed path, inside that transaction. Idempotent by
 * construction: the redemption row moves off `pending` in the same statement that
 * claims it, so a replayed webhook finds nothing to claim and credits nobody.
 *
 * Only the invitee's *first* booking pays out, which is what "only valid for
 * first-time bookings of invited friends" means.
 */
export async function awardReferralCredit(
  tx: DatabaseExecutor,
  referredUserId: string,
  bookingId: string,
): Promise<{ awarded: boolean; amountMinor: number }> {
  // Claim the pending redemption. The WHERE doubles as the idempotency guard.
  const claimed = await tx
    .update(referralRedemption)
    .set({ status: "credited", creditedAt: new Date() })
    .where(
      and(
        eq(referralRedemption.referredUserId, referredUserId),
        eq(referralRedemption.status, "pending"),
      ),
    )
    .returning({ id: referralRedemption.id, referralId: referralRedemption.referralId });

  const claim = claimed[0];
  if (!claim) return { awarded: false, amountMinor: 0 };

  const [owner] = await tx
    .select({ userId: referral.userId })
    .from(referral)
    .where(eq(referral.id, claim.referralId))
    .limit(1);

  if (!owner) return { awarded: false, amountMinor: 0 };

  // Read at award time, after the claim above has been counted.
  const bonusPct = await referralBonusPctFor(tx, owner.userId);
  const amountMinor = Math.round(BASE_REWARD_MINOR * (1 + bonusPct));

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + CREDIT_TTL_MONTHS);

  await tx.insert(creditLedger).values({
    userId: owner.userId,
    kind: "referral_reward",
    amountMinor,
    currency: REWARD_CURRENCY,
    bookingId,
    referralRedemptionId: claim.id,
    expiresAt,
    note: `Referral reward${bonusPct > 0 ? ` (+${Math.round(bonusPct * 100)}% tier bonus)` : ""}`,
  });

  return { awarded: true, amountMinor };
}

/**
 * The referrer's bonus rate. Read after the claim, so the referral that tips
 * someone into a new tier already earns that tier's rate — deliberately generous,
 * and it makes the jump visible on the very reward that caused it.
 */
async function referralBonusPctFor(tx: DatabaseExecutor, userId: string): Promise<number> {
  const [completed] = await tx
    .select({ total: count() })
    .from(referralRedemption)
    .innerJoin(referral, eq(referral.id, referralRedemption.referralId))
    .where(and(eq(referral.userId, userId), eq(referralRedemption.status, "credited")));

  const reached = await tx
    .select({ pct: loyaltyTier.referralBonusPct, required: loyaltyTier.requiredBookings })
    .from(loyaltyTier)
    .orderBy(asc(loyaltyTier.level));

  const earned = reached.filter((tier) => (completed?.total ?? 0) >= tier.required);
  return Number(earned.at(-1)?.pct ?? 0);
}

/** How many people used this user's code, whether or not they have sailed yet. */
export async function invitedCount(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(referralRedemption)
    .innerJoin(referral, eq(referral.id, referralRedemption.referralId))
    .where(eq(referral.userId, userId));

  return row?.total ?? 0;
}

/**
 * "Credits are usable for any yacht booking over €1000." Below that the balance
 * is untouched rather than partially spent, which is what the rule on the screen
 * says and keeps small bookings from quietly draining someone's credit.
 */
export const MIN_BOOKING_FOR_CREDIT_MINOR = 100_000;

/** How much credit this quote may absorb: never more than the balance or the bill. */
export async function spendableCreditMinor(
  db: Database,
  userId: string | null,
  bookingTotalMinor: number,
  payableNowMinor: number,
): Promise<number> {
  if (!userId) return 0;
  if (bookingTotalMinor < MIN_BOOKING_FOR_CREDIT_MINOR) return 0;

  const balance = await creditBalanceMinor(db, userId);
  return Math.max(Math.min(balance, payableNowMinor), 0);
}

/**
 * Spends credit against a confirmed booking, as a negative ledger row.
 *
 * Re-reads the balance inside the caller's transaction: the quote may have been
 * priced minutes ago, and credit could have been spent elsewhere since. Spends
 * whatever is actually left rather than trusting the quote, and reports it so the
 * caller can tell the difference.
 */
export async function redeemCredit(
  tx: DatabaseExecutor,
  input: { userId: string; bookingId: string; amountMinor: number; currency: string },
): Promise<{ spentMinor: number }> {
  if (input.amountMinor <= 0) return { spentMinor: 0 };

  const [row] = await tx
    .select({ total: sum(creditLedger.amountMinor) })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.userId, input.userId),
        or(isNull(creditLedger.expiresAt), gt(creditLedger.expiresAt, new Date())),
      ),
    );

  const available = Number(row?.total ?? 0);
  const spend = Math.min(input.amountMinor, Math.max(available, 0));
  if (spend <= 0) return { spentMinor: 0 };

  await tx.insert(creditLedger).values({
    userId: input.userId,
    kind: "booking_redemption",
    amountMinor: -spend,
    currency: input.currency,
    bookingId: input.bookingId,
    // Spending never expires; only earned credit carries a deadline.
    expiresAt: null,
    note: "Applied to booking",
  });

  return { spentMinor: spend };
}
