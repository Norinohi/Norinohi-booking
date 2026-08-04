"use client";

import { useTranslations } from "next-intl";

import type { PlannerAnswers } from "../lib/search-params";
import { StepLegend } from "./step-legend";
import { BudgetStep } from "./steps/budget-step";
import { DestinationStep } from "./steps/destination-step";
import { DurationStep } from "./steps/duration-step";
import { ExperienceStep } from "./steps/experience-step";
import { GroupSizeStep } from "./steps/group-size-step";
import { TripVibeStep } from "./steps/trip-vibe-step";

/*
 * Step router. Maps the current step number to its question component and gates the shell's
 * Next button via `isStepComplete`. Each step is its own component so a later step can be a
 * date range, budget slider, etc. without reshaping the others. Steps 2–6 and the result step
 * render a placeholder until their designs land.
 */
type SetAnswers = (values: Partial<PlannerAnswers>) => void;

export function PlannerSteps({
  current,
  answers,
  setAnswers,
}: {
  current: number;
  answers: PlannerAnswers;
  setAnswers: SetAnswers;
}) {
  switch (current) {
    case 1:
      return (
        <DestinationStep
          value={answers.destination}
          onChange={(destination) => setAnswers({ destination })}
        />
      );
    case 2:
      return (
        <GroupSizeStep
          value={answers.groupSize}
          onChange={(groupSize) => setAnswers({ groupSize })}
        />
      );
    case 3:
      return (
        <ExperienceStep
          value={answers.experience}
          onChange={(experience) => setAnswers({ experience })}
        />
      );
    case 4:
      return <TripVibeStep value={answers.vibe} onChange={(vibe) => setAnswers({ vibe })} />;
    case 5:
      return (
        <DurationStep value={answers.duration} onChange={(duration) => setAnswers({ duration })} />
      );
    case 6:
      return <BudgetStep value={answers.budget} onChange={(budget) => setAnswers({ budget })} />;
    default:
      return <ComingSoonStep current={current} />;
  }
}

/** Whether the current step has a valid answer; gates the shell's Next button. */
export function isStepComplete(current: number, answers: PlannerAnswers): boolean {
  switch (current) {
    case 1:
      return answers.destination != null;
    case 2:
      return answers.groupSize != null;
    case 3:
      return answers.experience != null;
    case 4:
      return answers.vibe != null;
    case 5:
      return answers.duration != null;
    case 6:
      return answers.budget != null;
    default:
      return true; // steps not yet built impose no gate
  }
}

function ComingSoonStep({ current }: { current: number }) {
  const t = useTranslations("PlanMyTrip");
  return (
    <div className="flex flex-col gap-4">
      <StepLegend title={t("stepHeading", { current })} subtitle={t("placeholder")} />
      <div className="min-h-93.5 rounded-lg border border-dashed border-natural-200" />
    </div>
  );
}
