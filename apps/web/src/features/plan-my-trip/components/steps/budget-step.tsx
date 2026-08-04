"use client";

import { useTranslations } from "next-intl";

import type { Budget } from "../../lib/search-params";
import { QuizCardGrid, type QuizChoice } from "../quiz-card-grid";
import { StepLegend } from "../step-legend";

/*
 * Step 6 — "What budget feels comfortable?" (Figma node 959:344345, 3 breakpoints). Single-select
 * grid of four price tiers; every card shares the same "per person/week" description. 2-up on md+
 * and stacked below. `id` is the value stored in the URL.
 */
export function BudgetStep({
  value,
  onChange,
}: {
  value: Budget | null;
  onChange: (value: Budget) => void;
}) {
  const t = useTranslations("PlanMyTrip.steps.budget");
  const perWeek = t("perPersonWeek");

  const choices: QuizChoice<Budget>[] = [
    { id: "300-600", label: t("options.low.label"), description: perWeek },
    { id: "600-1000", label: t("options.mid.label"), description: perWeek },
    { id: "1000-1200", label: t("options.high.label"), description: perWeek },
    { id: "2000-plus", label: t("options.premium.label"), description: perWeek },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <StepLegend title={t("question")} subtitle={t("subtitle")} />
      <QuizCardGrid choices={choices} value={value} onChange={onChange} />
    </div>
  );
}
