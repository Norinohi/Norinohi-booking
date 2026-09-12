import { z } from "zod";

import { currencySchema } from "./primitives";

export const profileSchema = z.object({
  userId: z.string(),
  // Display name as Better Auth stores it, kept for the "Hello, John Doe!" greeting.
  name: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  email: z.email(),
  phone: z.string().nullable(),
  /** ISO 3166-1 alpha-2, null until the customer says. Checkout prefills its own country from it. */
  countryCode: z.string().nullable(),
  locale: z.string(),
  currency: z.string().length(3),
  marketingOptIn: z.boolean(),
});

export type Profile = z.infer<typeof profileSchema>;

/**
 * ISO 3166-1 alpha-2, normalized the way every other country field on the API is.
 *
 * Absent and empty are different answers, the same as the text fields below: absent leaves the
 * saved country alone, empty clears it. Anything else has to be a pair of letters, because the
 * code travels to the charter base as-is.
 */
const optionalCountryCode = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform(toCountryCode)
  .refine(isCountryCode, "Expected an ISO 3166-1 alpha-2 country code");

function toCountryCode(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  return value === "" ? null : value.toUpperCase();
}

function isCountryCode(value: string | null | undefined): boolean {
  return value == null || /^[A-Z]{2}$/.test(value);
}

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
  countryCode: optionalCountryCode,
  locale: z.string().trim().min(2).max(10).optional(),
  currency: currencySchema.optional(),
  marketingOptIn: z.boolean().optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateInputSchema>;

export const profileDeactivateOutputSchema = z.object({
  deactivated: z.literal(true),
});
