"use client";

import { useTranslations } from "next-intl";

import type { Duration } from "../../lib/search-params";
import { QuizCardGrid, type QuizChoice } from "../quiz-card-grid";
import { StepLegend } from "../step-legend";

/*
 * Step 5 — "How long would you like your trip to be?" (Figma node 959:343327, 3 breakpoints).
 * Single-select grid of four durations, title-only cards (no description, no flag), 2-up on md+
 * and stacked below. `id` is the value stored in the URL.
 */
export function DurationStep({
  value,
  onChange,
}: {
  value: Duration | null;
  onChange: (value: Duration) => void;
}) {
  const t = useTranslations("PlanMyTrip.steps.duration");

  const choices: QuizChoice<Duration>[] = [
    { id: "7", label: t("options.week.label") },
    { id: "14", label: t("options.twoWeeks.label") },
    { id: "21", label: t("options.threeWeeks.label") },
    { id: "21-plus", label: t("options.more.label") },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <StepLegend title={t("question")} subtitle={t("subtitle")} />
      <QuizCardGrid choices={choices} value={value} onChange={onChange} />
    </div>
  );
}
