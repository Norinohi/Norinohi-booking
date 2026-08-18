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

/** The tier columns this file reads. `referralBonusPct` is numeric, so the driver hands a string. */
export type LadderTier = {
  code: string;
  name: string;
  level: number;
  requiredBookings: number;
  referralBonusPct: string | number;
};

export type LadderPerk = { code: string; label: string; tierLevel: number };

/*
 * The loyalty programme as arithmetic, with no database in it.
 *
 * Split from loyalty.ts for the same reason as refund-plan.ts: this decides what a referral pays
 * out, what the Referrals screen claims someone has earned, and how much credit a quote may
 * absorb — and all of that has to be checkable without a seeded database. Callers pass the tiers
 * and perks in level order.
 */

/**
 * Where someone sits on the ladder, from how many of their referrals have actually sailed.
 * Returns an empty progression when no tiers are seeded rather than throwing — the screen
 * degrades, it does not break.
 */
export function progressFor(
  tiers: readonly LadderTier[],
  perks: readonly LadderPerk[],
  completed: number,
): TierProgress {
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

  const current = reachedTier(tiers, completed);
  const next = tiers.find((tier) => tier.level > (current?.level ?? 0)) ?? null;

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
    // The card lists every perk in the programme and ticks the ones reached, so a locked
    // perk is visible as something to aim at.
    perks: perks.map((perk) => ({
      code: perk.code,
      label: perk.label,
      unlocked: (current?.level ?? 0) >= perk.tierLevel,
    })),
  };
}

/** The referrer's bonus rate at this many completed referrals. Zero below the first tier. */
export function bonusPctFor(tiers: readonly LadderTier[], completed: number): number {
  return Number(reachedTier(tiers, completed)?.referralBonusPct ?? 0);
}

/** What a referral pays out at that rate. Rounded to whole minor units — money has no fractions. */
export function rewardMinor(baseMinor: number, bonusPct: number): number {
  return Math.round(baseMinor * (1 + bonusPct));
}

/**
 * The highest tier whose threshold has been met, falling back to the lowest.
 *
 * The fallback matters: a programme whose first tier requires one booking still has to place
 * someone with none, and leaving them off the ladder entirely reads as an error on the screen
 * rather than as "not started yet".
 */
function reachedTier(tiers: readonly LadderTier[], completed: number): LadderTier | undefined {
  return tiers.filter((tier) => completed >= tier.requiredBookings).at(-1) ?? tiers[0];
}

/**
 * "Credits are usable for any yacht booking over €1000." Below that the balance is untouched
 * rather than partially spent, which is what the rule on the screen says and keeps small
 * bookings from quietly draining someone's credit.
 */
export const MIN_BOOKING_FOR_CREDIT_MINOR = 100_000;

/**
 * How much of a balance a quote may absorb: never more than the balance, and never more than
 * what is actually payable up front.
 *
 * Capped at `payableNowMinor` rather than the total because the extras a base collects in cash
 * on arrival are not ours to discount — spending credit against them would hand the customer a
 * reduction we still have to pay the operator in full.
 */
export function spendableFrom(
  balanceMinor: number,
  bookingTotalMinor: number,
  payableNowMinor: number,
): number {
  if (bookingTotalMinor < MIN_BOOKING_FOR_CREDIT_MINOR) return 0;
  return Math.max(Math.min(balanceMinor, payableNowMinor), 0);
}
