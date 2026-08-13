import { searchListings } from "@yacht-charter/db/search";
import type { z } from "zod";

import type { Database } from "../context";
import type { PlannerAnswers, plannerRecommendationSchema } from "../contracts/planner";
import { presentListingSummary } from "../presenters/listing";
type Recommendation = z.infer<typeof plannerRecommendationSchema>;

const CURRENCY = "EUR";

/*
 * Defaults mirror apps/web/src/features/plan-my-trip/components/result-screen.tsx,
 * which currently hardcodes them. Keep the two in step until the screen is switched
 * over, or a half-answered quiz will change its recommendation mid-migration.
 */
const DEFAULT_DESTINATION = "greece";
const DEFAULT_DURATION_DAYS = 21;
const DEFAULT_STYLE = "family" as const;
/** Used only for the price arithmetic when group size is unanswered. */
const NEUTRAL_GUESTS = 6;

type Destination = { country: string; flag: string };

/** "Not sure" is an answer, never a lookup key: it resolves to the default first. */
type AnsweredKey<TAnswer extends keyof PlannerAnswers> = Exclude<
  NonNullable<PlannerAnswers[TAnswer]>,
  "not-sure"
>;

const COUNTRIES = {
  croatia: { country: "Croatia", flag: "🇭🇷" },
  greece: { country: "Greece", flag: "🇬🇷" },
  italy: { country: "Italy", flag: "🇮🇹" },
  spain: { country: "Spain", flag: "🇪🇸" },
} satisfies Record<AnsweredKey<"destination">, Destination>;

const GROUP_SIZES = {
  "2-4": { guests: 4, minBerths: 4 },
  "5-8": { guests: 8, minBerths: 8 },
  "9-plus": { guests: 10, minBerths: 9 },
} satisfies Record<AnsweredKey<"groupSize">, { guests: number; minBerths: number }>;

/** Per person, per week, in minor units. `max: null` means open-ended. */
const BUDGETS = {
  "300-600": { min: 30_000, max: 60_000 },
  "600-1000": { min: 60_000, max: 100_000 },
  "1000-1200": { min: 100_000, max: 120_000 },
  "2000-plus": { min: 200_000, max: null },
} satisfies Record<AnsweredKey<"budget">, { min: number; max: number | null }>;

const DURATIONS = {
  "7": 7,
  "14": 14,
  "21": 21,
  "21-plus": 28,
} satisfies Record<AnsweredKey<"duration">, number>;

/**
 * The vibe steers the kind of boat rather than filtering hard on it — a party of
 * six who picked "relax" should still see a catamaran if that is what is free.
 */
const VIBE_CATEGORY = {
  adventure: "Sailing yacht",
  relax: "Catamaran",
  family: "Catamaran",
  luxury: "Luxury yacht",
  party: "Catamaran",
} satisfies Record<AnsweredKey<"vibe">, string>;

type TripBrief = {
  destination: Destination;
  group: (typeof GROUP_SIZES)[keyof typeof GROUP_SIZES] | undefined;
  budget: (typeof BUDGETS)[keyof typeof BUDGETS] | undefined;
  category: string | null;
  style: Recommendation["style"];
  durationDays: number;
  weeks: number;
  guestsForMath: number;
  crew: string[];
  skipperRequired: boolean;
  difficulty: "easy" | "moderate" | "advanced";
  maxPriceMinor: number | null;
};

/** Turns the quiz's nine optional answers into a complete brief, defaults filled. */
function resolveBrief(answers: PlannerAnswers): TripBrief {
  const destinationKey =
    answers.destination && answers.destination !== "not-sure"
      ? answers.destination
      : DEFAULT_DESTINATION;
  const destination: Destination = COUNTRIES[destinationKey];

  const group =
    answers.groupSize && answers.groupSize !== "not-sure"
      ? GROUP_SIZES[answers.groupSize]
      : undefined;
  const durationDays = answers.duration
    ? (DURATIONS[answers.duration] ?? 21)
    : DEFAULT_DURATION_DAYS;
  const style = answers.vibe ?? DEFAULT_STYLE;

  // Licence holders can take the boat themselves; everyone else needs someone aboard.
  const skipperRequired = answers.experience !== "licensed";

  const budget = answers.budget ? BUDGETS[answers.budget] : undefined;
  const weeks = Math.max(durationDays / 7, 1);
  const guestsForMath = group?.guests ?? NEUTRAL_GUESTS;

  return {
    destination,
    group,
    budget,
    category: VIBE_CATEGORY[style] ?? null,
    style,
    durationDays,
    weeks,
    guestsForMath,
    crew: skipperRequired ? ["skipper", "full-crew"] : ["bareboat"],
    skipperRequired,
    difficulty:
      answers.experience === "licensed"
        ? "advanced"
        : answers.experience === "some"
          ? "moderate"
          : "easy",
    // The budget is per person per week but listings are priced per boat per
    // period, so scale it up before filtering.
    maxPriceMinor:
      budget?.max === undefined || budget?.max === null
        ? null
        : Math.round(budget.max * guestsForMath * weeks),
  };
}

/**
 * Most specific first, widening a step at a time: drop the budget, then the
 * category the vibe implied, then the group and crew filters entirely. A visitor
 * always gets a boat rather than an empty result.
 */
async function findMatches(
  db: Database,
  brief: TripBrief,
): Promise<Awaited<ReturnType<typeof searchListings>> | null> {
  const baseFilters = {
    country: [brief.destination.country],
    crew: brief.crew,
    guests: brief.group?.guests,
    minBerths: brief.group?.minBerths,
    duration: brief.durationDays,
    currency: CURRENCY,
    sort: "recommended" as const,
    pageSize: 24,
    page: 1,
  };

  const attempts = [
    {
      ...baseFilters,
      category: brief.category ?? undefined,
      maxPriceMinor: brief.maxPriceMinor ?? undefined,
    },
    { ...baseFilters, category: brief.category ?? undefined },
    { ...baseFilters },
    {
      country: [brief.destination.country],
      duration: brief.durationDays,
      currency: CURRENCY,
      pageSize: 24,
    },
  ];

  for (const attempt of attempts) {
    const result = await searchListings(db, attempt);
    if (result.items.length > 0) return result;
  }

  return null;
}

/**
 * Turns the six quiz answers into a recommendation backed by real inventory.
 *
 * The search runs from most specific to least: if nothing matches with the category
 * the vibe implies, the category is dropped and it runs again, so a visitor always
 * gets a boat rather than an empty result.
 */
export async function recommendTrip(
  db: Database,
  answers: PlannerAnswers,
): Promise<Recommendation> {
  const brief = resolveBrief(answers);
  const { destination, category, durationDays, crew, style, skipperRequired } = brief;
  const { difficulty, budget, weeks, guestsForMath, maxPriceMinor, group } = brief;

  const matched = await findMatches(db, brief);
  const items = matched?.items ?? [];
  const top = items[0] ?? null;

  return {
    destination,
    // Describe the boat actually being recommended, not the heuristic that found it.
    yachtType: top?.category ?? category ?? "Catamaran",
    skipperRequired,
    style,
    difficulty,
    durationDays,
    estimatedPrice: estimatePrice(items, guestsForMath, weeks, budget),
    listing: top ? presentListingSummary(top, { duration: durationDays }) : null,
    matchCount: matched?.pagination?.totalItems ?? items.length,
    searchParams: {
      country: [destination.country],
      category,
      guests: group?.guests ?? null,
      duration: durationDays,
      crew,
      maxPriceMinor,
      currency: CURRENCY,
    },
  };
}

/**
 * Per person per week, from the yachts that matched. Falls back to the band the
 * visitor picked when nothing matched, so the figure is never invented.
 */
function estimatePrice(
  items: { priceFromMinor: number | null }[],
  guests: number,
  weeks: number,
  budget: { min: number; max: number | null } | undefined,
): Recommendation["estimatedPrice"] {
  const perPerson = items
    .map((item) => item.priceFromMinor)
    .filter((price): price is number => price !== null && price > 0)
    .map((price) => Math.round(price / guests / weeks));

  if (perPerson.length === 0) {
    const fallback = budget ?? BUDGETS["300-600"];
    return {
      min: { amountMinor: fallback?.min ?? 30_000, currency: CURRENCY },
      max: { amountMinor: fallback?.max ?? fallback?.min ?? 60_000, currency: CURRENCY },
      fromBudgetAnswer: true,
    };
  }

  return {
    min: { amountMinor: Math.min(...perPerson), currency: CURRENCY },
    max: { amountMinor: Math.max(...perPerson), currency: CURRENCY },
    fromBudgetAnswer: false,
  };
}
