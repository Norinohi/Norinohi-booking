"use client";

import { useTranslations } from "next-intl";

import type { GroupSize } from "../../lib/search-params";
import { QuizCardGrid, type QuizChoice } from "../quiz-card-grid";
import { StepLegend } from "../step-legend";

/*
 * Step 2 — "How many people are joining?" (Figma node 626:4727, 3 breakpoints). Single-select
 * grid of three group sizes plus a "Not sure" opt-out. Four cards fill the 2-up grid evenly, so
 * "Not sure" sits in the last cell (no full-width span) — it just carries no description.
 * `id` is the value stored in the URL.
 */
export function GroupSizeStep({
  value,
  onChange,
}: {
  value: GroupSize | null;
  onChange: (value: GroupSize) => void;
}) {
  const t = useTranslations("PlanMyTrip.steps.groupSize");

  const choices: QuizChoice<GroupSize>[] = [
    {
      id: "2-4",
      label: t("options.twoToFour.label"),
      description: t("options.twoToFour.description"),
    },
    {
      id: "5-8",
      label: t("options.fiveToEight.label"),
      description: t("options.fiveToEight.description"),
    },
    {
      id: "9-plus",
      label: t("options.ninePlus.label"),
      description: t("options.ninePlus.description"),
    },
    { id: "not-sure", label: t("options.notSure.label") },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <StepLegend title={t("question")} subtitle={t("subtitle")} />
      <QuizCardGrid choices={choices} value={value} onChange={onChange} />
    </div>
  );
}
