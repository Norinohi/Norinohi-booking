import type { AppRouterClient } from "@yacht-charter/api/routers/index";

import type { PlannerAnswers } from "./search-params";

export type PlannerRecommendInput = Parameters<AppRouterClient["planner"]["recommend"]>[0];

/** Drops the frontend-only `step` and turns unanswered `null`s into `undefined` for the contract. */
export function toPlannerInput(answers: PlannerAnswers): PlannerRecommendInput {
  return {
    destination: answers.destination ?? undefined,
    groupSize: answers.groupSize ?? undefined,
    experience: answers.experience ?? undefined,
    vibe: answers.vibe ?? undefined,
    duration: answers.duration ?? undefined,
    budget: answers.budget ?? undefined,
  };
}
