import { client } from "@/utils/orpc";

/* Called straight after sign-up rather than through a mutation hook: the form has already navigated
   away by the time it answers, so there is no component left to hold the mutation state. */
export const claimReferralCode = (code: string) => client.referral.claim({ code });
