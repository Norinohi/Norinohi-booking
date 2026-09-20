"use client";

import { useMoney } from "@/hooks/use-money";

import type { ReferralSummary } from "../types";

/**
 * The programme's terms, formatted for the sentences that quote them.
 *
 * Every figure on the Referrals screen used to be written into the copy: euro100 in three
 * places, euro1,000 in two, twelve months in one, across eleven locales. They are now a setting
 * staff can change, so the copy takes them as values and there is one place they come from.
 *
 * Undefined while the summary is in flight. The caller renders its skeleton rather than a
 * sentence with a hole in it, because a half-stated offer reads worse than no offer.
 */
export function useReferralTerms(summary: ReferralSummary | undefined) {
  const money = useMoney();

  if (!summary) return undefined;

  return {
    reward: money(summary.terms.reward.amountMinor, summary.terms.reward.currency),
    discount: money(
      summary.terms.inviteeDiscount.amountMinor,
      summary.terms.inviteeDiscount.currency,
    ),
    minBooking: money(summary.terms.minBooking.amountMinor, summary.terms.minBooking.currency),
    months: summary.terms.creditTtlMonths,
  };
}
