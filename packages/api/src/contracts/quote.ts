import { providerQuoteSchema } from "@yacht-charter/providers";
import { z } from "zod";

/**
 * The provider's quote plus our own id for it. `id` stays the provider's reference;
 * `quoteId` is what every later call (reprice, checkout) is keyed on, because only
 * our row is immutable and re-validatable.
 */
export const persistedQuoteSchema = providerQuoteSchema.extend({
  quoteId: z.string(),
});

export type PersistedQuoteContract = z.infer<typeof persistedQuoteSchema>;

/**
 * The booking sidebar edits dates, guests and extras in place. Every field except
 * the id is optional: an omitted field keeps whatever the previous quote had.
 */
export const repriceInputSchema = z
  .object({
    quoteId: z.string().min(1),
    checkIn: z.iso.date().optional(),
    checkOut: z.iso.date().optional(),
    guests: z.coerce.number().int().positive().max(100).optional(),
    extras: z.array(z.string().min(1)).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.checkIn && value.checkOut && value.checkOut <= value.checkIn) {
      ctx.addIssue({
        code: "custom",
        message: "checkOut must be after checkIn",
        path: ["checkOut"],
      });
    }
  });
