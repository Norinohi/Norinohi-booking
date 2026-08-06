import { z } from "zod";

import { listingSummarySchema, moneySchema } from "./catalog";

/*
 * The six answers from "Help me plan my trip". Every value mirrors
 * apps/web/src/features/plan-my-trip/lib/search-params.ts exactly — the wizard keeps
 * them in the URL, so the contract has to accept the same literals or a shared link
 * stops resolving. Each is optional: the visitor can answer "Not sure", or land on
 * the results with nothing filled in.
 */
export const plannerAnswersSchema = z
  .object({
    destination: z.enum(["croatia", "greece", "italy", "spain", "not-sure"]).optional(),
    groupSize: z.enum(["2-4", "5-8", "9-plus", "not-sure"]).optional(),
    experience: z.enum(["none", "some", "licensed"]).optional(),
    vibe: z.enum(["adventure", "relax", "family", "luxury", "party"]).optional(),
    duration: z.enum(["7", "14", "21", "21-plus"]).optional(),
    budget: z.enum(["300-600", "600-1000", "1000-1200", "2000-plus"]).optional(),
  })
  .default({});

export type PlannerAnswers = z.infer<typeof plannerAnswersSchema>;

export const plannerRecommendationSchema = z.object({
  destination: z.object({
    /** Matches a `country` value on the search read model, e.g. "Greece". */
    country: z.string(),
    flag: z.string(),
  }),
  /** Resolved category name, e.g. "Catamaran" — the "Yacht type" stat. */
  yachtType: z.string(),
  /** False only when the visitor holds a licence and can take the boat bareboat. */
  skipperRequired: z.boolean(),
  style: z.enum(["adventure", "relax", "family", "luxury", "party"]),
  difficulty: z.enum(["easy", "moderate", "advanced"]),
  durationDays: z.number().int(),
  /**
   * Estimated price per person per week. Derived from the yachts that actually
   * matched, so it reflects real inventory; falls back to the band the visitor
   * picked when nothing matched.
   */
  estimatedPrice: z.object({
    min: moneySchema,
    max: moneySchema,
    /** True when the range came from the visitor's budget answer, not inventory. */
    fromBudgetAnswer: z.boolean(),
  }),
  /** The single recommended yacht, or null when nothing matched. */
  listing: listingSummarySchema.nullable(),
  matchCount: z.number().int(),
  /**
   * The equivalent search, so "see all matches" can deep-link into /yachts with the
   * planner's answers already applied instead of re-deriving them client-side.
   */
  searchParams: z.object({
    country: z.array(z.string()),
    category: z.string().nullable(),
    guests: z.number().int().nullable(),
    duration: z.number().int(),
    crew: z.array(z.string()),
    maxPriceMinor: z.number().int().nullable(),
    currency: z.string().length(3),
  }),
});
