import type { AppRouterClient } from "@yacht-charter/api/routers/index";

/** View-type of the current user's profile, inferred from the oRPC contract. */
export type Profile = Awaited<ReturnType<AppRouterClient["profile"]["get"]>>;

/** Share code, stat tiles and loyalty progress behind /profile/referrals. */
export type ReferralSummary = Awaited<ReturnType<AppRouterClient["referral"]["summary"]>>;

export type ReferralHistoryRow = Awaited<
  ReturnType<AppRouterClient["referral"]["history"]>
>["items"][number];
