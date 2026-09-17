import { client, orpc } from "@/utils/orpc";

/* Called straight after sign-up rather than through a mutation hook: the form has already navigated
   away by the time it answers, so there is no component left to hold the mutation state. */
export const claimReferralCode = (code: string) => client.referral.claim({ code });

/** The account a set-password token belongs to, or null once it is used or expired. */
export const passwordResetTargetQueryOptions = (token: string) =>
  orpc.passwordReset.target.queryOptions({ input: { token } });
