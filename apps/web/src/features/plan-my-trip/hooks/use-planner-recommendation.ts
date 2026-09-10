"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";

import { plannerRecommendationQueryOptions } from "../api/queries";
import type { PlannerAnswers } from "../lib/search-params";
import { toPlannerInput } from "../lib/to-planner-input";

/** Turns the wizard's current answers into a real, inventory-backed trip recommendation. */
export function usePlannerRecommendation(answers: PlannerAnswers) {
  const locale = useLocale();
  return useQuery(plannerRecommendationQueryOptions({ ...toPlannerInput(answers), locale }));
}
