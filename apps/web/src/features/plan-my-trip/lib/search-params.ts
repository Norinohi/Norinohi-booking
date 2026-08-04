import { parseAsInteger, parseAsStringLiteral } from "nuqs";

/*
 * Planner URL state — the single source of truth for the wizard, shared by the shell,
 * the step components, and the result step. Each answer is a query param so the flow is
 * shareable, survives refresh, and the browser Back button walks the steps naturally
 * (the `step` param is pushed on every advance). Add one parser per new step's answer.
 */
export const TOTAL_STEPS = 6;

export const DESTINATIONS = ["croatia", "greece", "italy", "spain", "not-sure"] as const;
export type Destination = (typeof DESTINATIONS)[number];

export const GROUP_SIZES = ["2-4", "5-8", "9-plus", "not-sure"] as const;
export type GroupSize = (typeof GROUP_SIZES)[number];

export const EXPERIENCE_LEVELS = ["none", "some", "licensed"] as const;
export type Experience = (typeof EXPERIENCE_LEVELS)[number];

export const TRIP_VIBES = ["adventure", "relax", "family", "luxury", "party"] as const;
export type TripVibe = (typeof TRIP_VIBES)[number];

export const DURATIONS = ["7", "14", "21", "21-plus"] as const;
export type Duration = (typeof DURATIONS)[number];

export const BUDGETS = ["300-600", "600-1000", "1000-1200", "2000-plus"] as const;
export type Budget = (typeof BUDGETS)[number];

export const plannerParsers = {
  step: parseAsInteger.withDefault(1).withOptions({ history: "push", scroll: true }),
  destination: parseAsStringLiteral(DESTINATIONS),
  groupSize: parseAsStringLiteral(GROUP_SIZES),
  experience: parseAsStringLiteral(EXPERIENCE_LEVELS),
  vibe: parseAsStringLiteral(TRIP_VIBES),
  duration: parseAsStringLiteral(DURATIONS),
  budget: parseAsStringLiteral(BUDGETS),
};

/** Shape of the resolved planner answers, e.g. `{ step: 1, destination: "greece" | null }`. */
export type PlannerAnswers = {
  step: number;
  destination: Destination | null;
  groupSize: GroupSize | null;
  experience: Experience | null;
  vibe: TripVibe | null;
  duration: Duration | null;
  budget: Budget | null;
};
