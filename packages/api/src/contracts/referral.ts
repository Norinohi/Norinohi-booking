import { z } from "zod";

export const referralCodeSchema = z.object({
  code: z.string(),
  /** Relative path the share link points at — the web app prefixes its own origin. */
  urlPath: z.string(),
});

export type ReferralCode = z.infer<typeof referralCodeSchema>;

export const referralClaimInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

export const referralClaimResultSchema = z.object({
  accepted: z.boolean(),
  code: z.string(),
  /** Null when accepted; otherwise why the claim was refused, for the signup toast. */
  reason: z.enum(["unknown_code", "own_code", "already_referred"]).nullable(),
});

export type ReferralClaimResult = z.infer<typeof referralClaimResultSchema>;
