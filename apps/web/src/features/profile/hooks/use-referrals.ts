"use client";

import { useQuery } from "@tanstack/react-query";

import { referralCodeQueryOptions } from "../api/queries";

/** Reads the user's referral code — server-prefetched on /profile/referrals, so it hydrates warm. */
export function useReferralCode() {
  return useQuery(referralCodeQueryOptions());
}
