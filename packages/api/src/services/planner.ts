import { listCatalogueCountries } from "@yacht-charter/db/search/catalogue-countries";
import { searchListings, valueForLabel } from "@yacht-charter/db/search";
import type { z } from "zod";

import type { Database } from "../context";
import { countryFlag } from "../lib/country-flag";
import type { PlannerAnswers, plannerRecommendationSchema } from "../contracts/planner";
import { presentListingSummary, pricedPeriodDays, WEEKLY_RATE_DAYS } from "../presenters/listing";
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

/**
 * The destination as the geography tables name it, flag included.
 *
 * The answer is a slug of the country's English name ("greece"), which is also how the search
 * links filter by country, so the folded name is the whole lookup. Only the four slugs the
 * contract accepts ever reach here; the list of them lives with the wizard's URL, not here.
 */
async function resolveDestination(
  db: Database,
  key: AnsweredKey<"destination">,
): Promise<Destination> {
  const [match] = await listCatalogueCountries(db, { name: key });
  /* A catalogue without the country still gets a plan, only without a flag or boats in it. */
  if (!match || valueForLabel(match.name) !== key) {
    return { country: key.charAt(0).toUpperCase() + key.slice(1), flag: "" };
  }
  return { country: match.name, flag: countryFlag(match.code) };
}

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
  "1200-2000": { min: 120_000, max: 200_000 },
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
  guestsForMath: number;
  crew: string[];
  skipperRequired: boolean;
  difficulty: "easy" | "moderate" | "advanced";
  maxPriceMinor: number | null;
};

/** The destination the brief is for, "not sure" and unanswered resolving to the default. */
function destinationKeyOf(answers: PlannerAnswers): AnsweredKey<"destination"> {
  return answers.destination && answers.destination !== "not-sure"
    ? answers.destination
    : DEFAULT_DESTINATION;
}

/** Turns the quiz's nine optional answers into a complete brief, defaults filled. */
function resolveBrief(answers: PlannerAnswers, destination: Destination): TripBrief {
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
  const guestsForMath = group?.guests ?? NEUTRAL_GUESTS;

  return {
    destination,
    group,
    budget,
    category: VIBE_CATEGORY[style] ?? null,
    style,
    durationDays,
    guestsForMath,
    crew: skipperRequired ? ["skipper", "full-crew"] : ["bareboat"],
    skipperRequired,
    difficulty:
      answers.experience === "licensed"
        ? "advanced"
        : answers.experience === "some"
          ? "moderate"
          : "easy",
    /*
     * The budget is per person per week and a listing's price covers one week, so the group
     * is the whole conversion. Multiplying by the trip's weeks as well let a three-week brief
     * on the lowest band match yachts at three times the money the visitor named.
     */
    maxPriceMinor:
      budget?.max === undefined || budget?.max === null
        ? null
        : Math.round(budget.max * guestsForMath),
  };
}

type SearchFilters = Parameters<typeof searchListings>[1];

/**
 * Most specific first, widening a step at a time, and the budget held longest.
 *
 * The budget used to be the first thing dropped, so a crewed-sailing-yacht brief with nothing
 * under EUR 2,400 went straight to the whole fleet in recommended order: a EUR 300-600 a head
 * brief was answered with a EUR 5,600 Moody 54, and "similar" ran to EUR 12,320 a head. Now the
 * vibe's category goes first, keeping the budget.
 *
 * Where nothing the group can sail fits the budget, the budget goes before the group and crew
 * do, and the cheapest such yacht is the one recommended: the closest to what the visitor said
 * they would spend. Keeping the budget by dropping the crew instead would hand a party with no
 * licence a bareboat beside a panel that says they need a skipper.
 */
async function findMatches(
  db: Database,
  brief: TripBrief,
  locale: string | undefined,
): Promise<{
  result: Awaited<ReturnType<typeof searchListings>>;
  filters: SearchFilters;
} | null> {
  const broad = {
    locale,
    country: [brief.destination.country],
    duration: brief.durationDays,
    currency: CURRENCY,
    /* The figure the per-person share and the card are read off, so the cap compares the same one. */
    priceBasis: "all_in" as const,
    sort: "recommended" as const,
    pageSize: 24,
    page: 1,
  };
  const grouped = {
    ...broad,
    crew: brief.crew,
    guests: brief.group?.guests,
    minBerths: brief.group?.minBerths,
  };
  const specific = { ...grouped, category: brief.category ?? undefined };

  const ceiling = brief.maxPriceMinor;
  const affordable = (filters: SearchFilters) => ({
    ...filters,
    maxPriceMinor: ceiling ?? undefined,
  });
  const cheapestFirst = (filters: SearchFilters) => ({ ...filters, sort: "price-asc" as const });
  const attempts: SearchFilters[] =
    ceiling === null
      ? [specific, grouped, broad]
      : [
          affordable(specific),
          affordable(grouped),
          cheapestFirst(specific),
          cheapestFirst(grouped),
          affordable(broad),
          cheapestFirst(broad),
        ];

  for (const attempt of attempts) {
    const result = await searchListings(db, attempt);
    if (result.items.length > 0) return { result, filters: attempt };
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
  const brief = resolveBrief(answers, await resolveDestination(db, destinationKeyOf(answers)));
  const { destination, category, durationDays, style, skipperRequired } = brief;
  const { difficulty, budget, guestsForMath } = brief;

  const matched = await findMatches(db, brief, answers.locale);
  const items = matched?.result.items ?? [];
  /*
   * Only the yachts priced by the week take part, both in the range and in the pick.
   *
   * `price_from_minor` prices each listing's own first sellable charter, which is a week for
   * most of the fleet and three days for a few. Reading those few as though they were weeks
   * made the cheapest figure on the screen the price of a long weekend, and handed the
   * recommendation to the yacht selling it: on a Spanish catamaran brief it ranked sixth
   * cheapest of twenty-four that way, and twenty-first once its own week was priced.
   */
  const byTheWeek = items.filter((item) => pricedPeriodDays(item) === WEEKLY_RATE_DAYS);
  /*
   * The range and the recommendation are read off one list, so the yacht on the card is always
   * one of the yachts the range describes. A listing whose price has no comparable figure sits
   * both of them out rather than only the range: recommending it printed a card price the band
   * beside it did not reach, which is the mismatch this screen exists to avoid.
   */
  const comparable = byTheWeek.filter(
    (item) => item.priceFromMinorEur !== null && item.priceFromMinorEur > 0,
  );
  // A brief nothing comparable matched still gets a boat rather than an empty screen.
  const top = comparable[0] ?? byTheWeek[0] ?? items[0] ?? null;

  return {
    destination,
    // Describe the boat actually being recommended, not the heuristic that found it.
    yachtType: top?.category ?? category ?? "Catamaran",
    skipperRequired,
    style,
    difficulty,
    durationDays,
    estimatedPrice: estimatePrice(comparable, guestsForMath, budget),
    listing: top ? presentListingSummary(top) : null,
    period:
      top?.nearestCheckIn && top.nearestCheckOut
        ? { checkIn: top.nearestCheckIn, checkOut: top.nearestCheckOut }
        : null,
    recommendedPerPerson: top ? perPersonOf(top, guestsForMath) : null,
    matchCount: matched?.result.pagination?.totalItems ?? items.length,
    // Carry the successful search forward: a fallback must not restore the rejected budget.
    searchParams: {
      country: [valueForLabel(destination.country)],
      category: matched?.filters.category ? valueForLabel(matched.filters.category) : null,
      guests: matched?.filters.guests ?? null,
      minBerths: matched?.filters.minBerths ?? null,
      duration: durationDays,
      crew: matched?.filters.crew ?? [],
      maxPriceMinor: matched?.filters.maxPriceMinor ?? null,
      currency: CURRENCY,
    },
  };
}

/**
 * What the recommended yacht costs each member of the group, in the yacht's own currency.
 *
 * Read off the published price rather than the converted one, because this figure prints
 * under that same price on the card: a euro figure beside a dollar price is two currencies
 * claiming to be one charter.
 */
function perPersonOf(
  doc: { priceFromMinor: number | null; currency: string | null },
  guests: number,
) {
  return doc.priceFromMinor !== null && doc.priceFromMinor > 0
    ? { amountMinor: Math.round(doc.priceFromMinor / guests), currency: doc.currency ?? CURRENCY }
    : null;
}

/**
 * A week aboard the yachts that matched, per person and per yacht. Falls back to the band the
 * visitor picked when nothing matched, so the figure is never invented.
 *
 * Every price here covers exactly one week, which is what the caller filtered for, so the
 * range needs no scaling: dividing a weekly rate by the trip's weeks was reporting a
 * three-week brief as a third of the money the same fleet costs a one-week brief.
 *
 * Read off the converted price rather than the published one, because this takes a min and a
 * max across the whole match and then labels the pair CURRENCY. On a Caribbean brief that
 * matched both EUR and USD hulls, the two ends came from different currencies and the range
 * described no fleet that exists. A yacht with no comparable price sits the estimate out.
 */
function estimatePrice(
  items: { priceFromMinorEur: number | null }[],
  guests: number,
  budget: { min: number; max: number | null } | undefined,
): Recommendation["estimatedPrice"] {
  const money = (amountMinor: number) => ({ amountMinor, currency: CURRENCY });
  const perBoat = items
    .map((item) => item.priceFromMinorEur)
    .filter((price): price is number => price !== null && price > 0);

  if (perBoat.length === 0) {
    const fallback = budget ?? BUDGETS["300-600"];
    const min = fallback?.min ?? 30_000;
    const max = fallback?.max ?? min;
    return {
      perPerson: { min: money(min), max: money(max) },
      perBoat: { min: money(min * guests), max: money(max * guests) },
      guests,
      sampleSize: 0,
      fromBudgetAnswer: true,
    };
  }

  const min = Math.min(...perBoat);
  const max = Math.max(...perBoat);
  return {
    perPerson: { min: money(Math.round(min / guests)), max: money(Math.round(max / guests)) },
    perBoat: { min: money(min), max: money(max) },
    guests,
    sampleSize: perBoat.length,
    fromBudgetAnswer: false,
  };
}
