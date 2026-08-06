import { z } from "zod";

export const profileSchema = z.object({
  userId: z.string(),
  // Display name as Better Auth stores it, kept for the "Hello, John Doe!" greeting.
  name: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.email(),
  phone: z.string().nullable(),
  locale: z.string(),
  currency: z.string().length(3),
  marketingOptIn: z.boolean(),
});

export type Profile = z.infer<typeof profileSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === "" ? null : value));

// Email is intentionally absent: email changes go through Better Auth's
// changeEmail flow on the client, not through this procedure.
// This is a public OpenAPI endpoint, so the contract itself normalizes and
// bounds the values — the web form's own cleanup only mirrors it.
export const profileUpdateInputSchema = z.object({
  firstName: optionalText(100),
  lastName: optionalText(100),
  phone: optionalText(32),
  locale: z.string().trim().min(2).max(10).optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  marketingOptIn: z.boolean().optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateInputSchema>;

export const profileDeactivateOutputSchema = z.object({
  deactivated: z.literal(true),
});
