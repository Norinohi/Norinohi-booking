import { z } from "zod";

export const profileSchema = z.object({
  userId: z.string(),
  name: z.string(),
  email: z.email(),
  phone: z.string().nullable(),
  locale: z.string(),
  currency: z.string().length(3),
  marketingOptIn: z.boolean(),
});

export type Profile = z.infer<typeof profileSchema>;

// Email is intentionally absent: email changes go through Better Auth's
// changeEmail flow on the client, not through this procedure.
// This is a public OpenAPI endpoint, so the contract itself normalizes and
// bounds the values — the web form's own cleanup only mirrors it.
export const profileUpdateInputSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z
    .string()
    .trim()
    .max(32)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value)),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateInputSchema>;

export const profileDeactivateOutputSchema = z.object({
  deactivated: z.literal(true),
});
