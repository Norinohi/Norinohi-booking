import { referral, referralRedemption } from "@yacht-charter/db/schema/account";
import { creditLedger, loyaltyPerk, loyaltyTier } from "@yacht-charter/db/schema/loyalty";
import { and, asc, count, eq, gt, isNull, or, sql, sum } from "drizzle-orm";

import type { Database, DatabaseExecutor } from "../context";
import {
  bonusPctFor,
  MIN_BOOKING_FOR_CREDIT_MINOR,
  progressFor,
  rewardMinor,
  spendableFrom,
  type TierProgress,
} from "./loyalty-ladder";

export { MIN_BOOKING_FOR_CREDIT_MINOR };

export type { TierProgress };

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
const CREDIT_TTL_MONTHS = 12;

/*
 * The currency credit is minted in, and the only one it can be spent in.
 *
 * `credit_ledger` carries a currency per row, so every balance has to be read within one:
 * summing the column across currencies produces a number that is not an amount of money,
 * and spending it against a booking priced in another currency hands the customer whatever
 * the exchange rate happens to be, one to one. There is no FX source on this side of the
 * app and there is not meant to be: a quote holds one currency, and multi-currency is
 * handled by re-quoting (docs/open-questions-and-decisions.md §4).
 */
export const CREDIT_CURRENCY = "EUR";

/** Unexpired balance in one currency. Summed from the ledger so it cannot drift from its entries. */
export async function creditBalanceMinor(
  db: Database,
  userId: string,
  currency: string,
): Promise<number> {
  const [row] = await db
    .select({ total: sum(creditLedger.amountMinor) })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.userId, userId),
        eq(creditLedger.currency, currency),
        or(isNull(creditLedger.expiresAt), gt(creditLedger.expiresAt, new Date())),
      ),
    );

  return Number(row?.total ?? 0);
}

/** Everything ever earned in one currency, ignoring what has since been spent or expired. */
export async function totalEarnedMinor(
  db: Database,
  userId: string,
  currency: string,
): Promise<number> {
  const [row] = await db
    .select({ total: sum(creditLedger.amountMinor) })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.userId, userId),
        eq(creditLedger.currency, currency),
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

  // The perk read is skipped rather than issued and discarded: an unseeded programme has no
  // tiers to hang perks off, so the join can only be empty.
  const perks =
    tiers.length === 0
      ? []
      : await db
          .select({
            code: loyaltyPerk.code,
            label: loyaltyPerk.label,
            tierLevel: loyaltyTier.level,
          })
          .from(loyaltyPerk)
          .innerJoin(loyaltyTier, eq(loyaltyTier.id, loyaltyPerk.tierId))
          .orderBy(asc(loyaltyTier.level), asc(loyaltyPerk.sortOrder));

  return progressFor(tiers, perks, completed);
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
  const amountMinor = rewardMinor(BASE_REWARD_MINOR, bonusPct);

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + CREDIT_TTL_MONTHS);

  await tx.insert(creditLedger).values({
    userId: owner.userId,
    kind: "referral_reward",
    amountMinor,
    currency: CREDIT_CURRENCY,
    bookingId,
    referralRedemptionId: claim.id,
    expiresAt,
    note: `Referral reward${bonusPct > 0 ? ` (+${Math.round(bonusPct * 100)}% tier bonus)` : ""}`,
  });

  return { awarded: true, amountMinor };
}

/**
 * What a referral would pay out if the invitee sailed right now, at the
 * referrer's current tier. The Referrals screen shows this against pending rows
 * so the reward is visible before it is earned; the figure actually credited is
 * recomputed at award time and can be higher if the referrer has levelled up by
 * then.
 */
export async function projectedRewardMinor(db: Database, userId: string): Promise<number> {
  const bonusPct = await referralBonusPctFor(db, userId);
  return rewardMinor(BASE_REWARD_MINOR, bonusPct);
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

  const tiers = await tx.select().from(loyaltyTier).orderBy(asc(loyaltyTier.level));

  return bonusPctFor(tiers, completed?.total ?? 0);
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

/*
 * The invitee's half of the referral: "They get €100 off their first yacht
 * booking over €1000". Same headline figure as the referrer's reward, but a
 * different rule — no tier bonus applies, since levelling up is the referrer's
 * perk and the invitee has no tier yet.
 *
 * Both figures, and `MIN_BOOKING_FOR_CREDIT_MINOR` with them, are amounts in
 * `CREDIT_CURRENCY`. The copy on the Referrals screen states them with a euro sign, so
 * they are a promise in one currency rather than a bare number to be re-read as whatever
 * the quote happens to be priced in.
 */
const INVITEE_WELCOME_MINOR = 10_000;

/**
 * What the invitee comes off this quote, resolved at pricing time rather than
 * granted at signup. A share link therefore mints no balance: someone who
 * registers and never books costs nothing, and the discount cannot be spent on
 * anything except the booking it was quoted against.
 *
 * A pending redemption *is* the eligibility. `awardReferralCredit` flips it to
 * `credited` when the first booking confirms, so the discount is unavailable on
 * every booking after that one — which is what "first-time bookings of invited
 * friends" means.
 *
 * A quote in another currency comes off nothing, for the reason credit cannot be spent on
 * one: €100 is not 100 of whatever the quote is priced in, and the eligibility threshold
 * is not either. The redemption stays `pending`, so the invitee still has the discount
 * waiting on the first quote we can honour it against.
 */
export async function welcomeDiscountMinor(
  db: DatabaseExecutor,
  userId: string | null,
  currency: string,
  bookingTotalMinor: number,
  payableNowMinor: number,
): Promise<number> {
  if (!userId) return 0;
  if (currency !== CREDIT_CURRENCY) return 0;
  if (bookingTotalMinor < MIN_BOOKING_FOR_CREDIT_MINOR) return 0;

  const [pending] = await db
    .select({ id: referralRedemption.id })
    .from(referralRedemption)
    .where(
      and(eq(referralRedemption.referredUserId, userId), eq(referralRedemption.status, "pending")),
    )
    .limit(1);

  if (!pending) return 0;

  return Math.max(Math.min(INVITEE_WELCOME_MINOR, payableNowMinor), 0);
}

/**
 * How much credit this quote may absorb: never more than the balance or the bill.
 *
 * A quote in any other currency absorbs nothing. Both the balance and the minimum-booking
 * threshold are denominated in `CREDIT_CURRENCY`, so there is no comparison to make against
 * a bill priced elsewhere, and converting one would be inventing a rate.
 */
export async function spendableCreditMinor(
  db: Database,
  userId: string | null,
  currency: string,
  bookingTotalMinor: number,
  payableNowMinor: number,
): Promise<number> {
  if (!userId) return 0;
  if (currency !== CREDIT_CURRENCY) return 0;
  if (bookingTotalMinor < MIN_BOOKING_FOR_CREDIT_MINOR) return 0;

  return spendableFrom(
    await creditBalanceMinor(db, userId, currency),
    bookingTotalMinor,
    payableNowMinor,
  );
}

/**
 * Spends credit against a confirmed booking, as a negative ledger row.
 *
 * Re-reads the balance inside the caller's transaction: the quote may have been
 * priced minutes ago, and credit could have been spent elsewhere since. Spends
 * whatever is actually left rather than trusting the quote, and reports it so the
 * caller can tell the difference.
 *
 * That re-read is scoped to the booking's own currency, which is also what stops a
 * balance held in another one from paying this bill. `spendableCreditMinor` has already
 * refused such a quote, so reaching here with a mismatch means the quote was priced
 * before that rule existed: it spends nothing rather than trusting the stored figure.
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
        eq(creditLedger.currency, input.currency),
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
