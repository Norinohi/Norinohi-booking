"use client";

import { useTranslations } from "next-intl";

import type { Destination } from "../../lib/search-params";
import { QuizCardGrid, type QuizChoice } from "../quiz-card-grid";
import { StepLegend } from "../step-legend";

/*
 * Step 1 — "Where would you like to sail?" (Figma node 626:4258, 3 breakpoints). Single-select
 * grid of four destinations plus a full-width "Not sure" opt-out with no flag or description.
 * `id` is the value stored in the URL.
 */
export function DestinationStep({
  value,
  onChange,
}: {
  value: Destination | null;
  onChange: (value: Destination) => void;
}) {
  const t = useTranslations("PlanMyTrip.steps.destination");

  const choices: QuizChoice<Destination>[] = [
    {
      id: "croatia",
      flag: "🇭🇷",
      label: t("options.croatia.label"),
      description: t("options.croatia.description"),
    },
    {
      id: "greece",
      flag: "🇬🇷",
      label: t("options.greece.label"),
      description: t("options.greece.description"),
    },
    {
      id: "italy",
      flag: "🇮🇹",
      label: t("options.italy.label"),
      description: t("options.italy.description"),
    },
    {
      id: "spain",
      flag: "🇪🇸",
      label: t("options.spain.label"),
      description: t("options.spain.description"),
    },
    { id: "not-sure", label: t("options.notSure.label"), fullWidth: true },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <StepLegend title={t("question")} subtitle={t("subtitle")} />
      <QuizCardGrid choices={choices} value={value} onChange={onChange} />
    </div>
  );
}
