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
