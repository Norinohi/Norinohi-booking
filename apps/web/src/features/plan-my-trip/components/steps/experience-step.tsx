"use client";

import { useTranslations } from "next-intl";

import type { Experience } from "../../lib/search-params";
import { QuizCardGrid, type QuizChoice } from "../quiz-card-grid";
import { StepLegend } from "../step-legend";

/*
 * Step 3 — "Do you have sailing experience?" (Figma node 959:321776, 3 breakpoints). Single-select
 * grid of three experience levels, no opt-out and no subtitle (the design hides the helper line).
 * Three cards fill the 2-up grid as 2 + 1. `id` is the value stored in the URL.
 */
export function ExperienceStep({
  value,
  onChange,
}: {
  value: Experience | null;
  onChange: (value: Experience) => void;
}) {
  const t = useTranslations("PlanMyTrip.steps.experience");

  const choices: QuizChoice<Experience>[] = [
    { id: "none", label: t("options.none.label"), description: t("options.none.description") },
    { id: "some", label: t("options.some.label"), description: t("options.some.description") },
    {
      id: "licensed",
      label: t("options.licensed.label"),
      description: t("options.licensed.description"),
    },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <StepLegend title={t("question")} />
      <QuizCardGrid choices={choices} value={value} onChange={onChange} />
    </div>
  );
}
