"use client";

import { useQuery } from "@tanstack/react-query";

import { plannerRecommendationQueryOptions } from "../api/queries";
import type { PlannerAnswers } from "../lib/search-params";
import { toPlannerInput } from "../lib/to-planner-input";

/** Turns the wizard's current answers into a real, inventory-backed trip recommendation. */
export function usePlannerRecommendation(answers: PlannerAnswers) {
  return useQuery(plannerRecommendationQueryOptions(toPlannerInput(answers)));
}
