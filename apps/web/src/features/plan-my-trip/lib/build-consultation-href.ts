"use client";

import type { AppPathname } from "@/i18n/navigation";
import { createSerializer } from "nuqs";

import { plannerParsers } from "./search-params";
import type { PlannerAnswers } from "./search-params";

const serialize = createSerializer(plannerParsers);

/** Carries the wizard's answers over to /plan-my-trip/consultation via the same URL params. */
export function buildConsultationHref(answers: PlannerAnswers): AppPathname {
  return serialize("/plan-my-trip/consultation", {
    destination: answers.destination,
    groupSize: answers.groupSize,
    experience: answers.experience,
    vibe: answers.vibe,
    duration: answers.duration,
    budget: answers.budget,
  });
}
