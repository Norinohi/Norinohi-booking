/*
 * Sample referral data for the /profile/referrals screen — static until the referrals
 * backend exists (mirrors SAMPLE_BOOKINGS for /profile/bookings).
 */

/** Stat tiles in the invite hero. `label` is a key under `Referrals.invite.stats`. */
export const REFERRAL_STATS = [
  { value: "12", label: "invited" },
  { value: "3", label: "completed" },
  { value: "€300", label: "earned" },
  { value: "€100", label: "balance" },
] as const;

/** Loyalty level shown in the "Your Level" card. Progress is the slider fill percentage. */
export const REFERRAL_LEVEL = {
  current: "Navigator",
  next: "Captain",
  progress: 24,
  bookingsLeft: 2,
  /** Perk keys under `Referrals.how.level.perks`; `unlocked` renders checked + struck. */
  perks: [
    { key: "extra", unlocked: true },
    { key: "early", unlocked: true },
    { key: "concierge", unlocked: false },
  ],
} as const;

/** Referral history rows. `daysAgo` feeds `Referrals.history.daysAgo`. */
export const SAMPLE_REFERRALS = [
  { id: "ref-1", name: "Daniel Weber", daysAgo: 2, status: "completed", amount: "€100" },
  { id: "ref-2", name: "Sophie Martin", daysAgo: 30, status: "completed", amount: "€100" },
  { id: "ref-3", name: "James Carter", daysAgo: 2, status: "pending", amount: "€100" },
] as const;

export type ReferralRow = (typeof SAMPLE_REFERRALS)[number];
