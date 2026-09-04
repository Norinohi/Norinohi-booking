import { z } from "zod";

import { listingSummarySchema } from "./catalog";
import { moneySchema } from "./primitives";

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

/** Both ends of a price band, always the same currency and the same length of charter. */
const priceRangeSchema = z.object({ min: moneySchema, max: moneySchema });

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
   * What a week aboard the matching yachts costs, in both units the results screen prints.
   *
   * Derived from the yachts that actually matched, so it reflects real inventory; falls back
   * to the band the visitor picked when nothing matched. Only yachts whose price covers a
   * week are read, so both ends of both ranges describe the same length of charter.
   */
  estimatedPrice: z.object({
    /** Per person, one week. The unit the budget step asked its question in. */
    perPerson: priceRangeSchema,
    /** The same charters undivided: what the whole yacht costs for that week. */
    perBoat: priceRangeSchema,
    /** The group size the per-person figures were divided by, so the screen can name it. */
    guests: z.number().int(),
    /** How many yachts the range was read from. Zero when it came from the budget answer. */
    sampleSize: z.number().int(),
    /** True when the range came from the visitor's budget answer, not inventory. */
    fromBudgetAnswer: z.boolean(),
  }),
  /** The single recommended yacht, or null when nothing matched. */
  listing: listingSummarySchema.nullable(),
  /**
   * The recommended yacht's own price divided by the group, in that listing's currency so it
   * sits beside the price on its card rather than beside the estimate's.
   */
  recommendedPerPerson: moneySchema.nullable(),
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
