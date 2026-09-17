import { z } from "zod";

export const passwordResetTargetInputSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

/** Null when the token is unknown, used or expired: the screen shows its invalid-link state. */
export const passwordResetTargetSchema = z
  .object({
    userId: z.string(),
    email: z.email(),
  })
  .nullable();

export type PasswordResetTarget = z.infer<typeof passwordResetTargetSchema>;
