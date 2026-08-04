"use client";

import { useTranslations } from "next-intl";

import type { TripVibe } from "../../lib/search-params";
import { QuizCardGrid, type QuizChoice } from "../quiz-card-grid";
import { StepLegend } from "../step-legend";

/*
 * Step 4 — "What kind of trip are you looking for?" (Figma node 959:322072, 3 breakpoints).
 * Single-select grid of five trip vibes, each with an emoji badge. Five cards fill the 2-up grid
 * as 2 + 2 + 1 (the last sits in the trailing cell, no full-width span). `id` is stored in the URL.
 */
export function TripVibeStep({
  value,
  onChange,
}: {
  value: TripVibe | null;
  onChange: (value: TripVibe) => void;
}) {
  const t = useTranslations("PlanMyTrip.steps.tripVibe");

  const choices: QuizChoice<TripVibe>[] = [
    {
      id: "adventure",
      flag: "💫",
      label: t("options.adventure.label"),
      description: t("options.adventure.description"),
    },
    {
      id: "relax",
      flag: "🏖️",
      label: t("options.relax.label"),
      description: t("options.relax.description"),
    },
    {
      id: "family",
      flag: "👪",
      label: t("options.family.label"),
      description: t("options.family.description"),
    },
    {
      id: "luxury",
      flag: "⭐️",
      label: t("options.luxury.label"),
      description: t("options.luxury.description"),
    },
    {
      id: "party",
      flag: "🥳",
      label: t("options.party.label"),
      description: t("options.party.description"),
    },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <StepLegend title={t("question")} subtitle={t("subtitle")} />
      <QuizCardGrid choices={choices} value={value} onChange={onChange} />
    </div>
  );
}
