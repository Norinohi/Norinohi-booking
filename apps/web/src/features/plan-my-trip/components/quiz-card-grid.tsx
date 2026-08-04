"use client";

import { QuizCard } from "@yacht-charter/ui/components/data-display/card-quiz";
import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * QuizCardGrid — the shared single-select body used by card-quiz steps (Figma "Card Grid").
 * 2-up on md+, single column below. Steps resolve their own i18n and pass ready-made choices,
 * so this stays presentational and next-intl keeps its typed-key checking at the call site.
 * Mark an opt-out choice `fullWidth` to span both columns (e.g. a trailing "Not sure" on an
 * odd-count grid).
 */
export type QuizChoice<T extends string> = {
  id: T;
  label: string;
  description?: string;
  flag?: string;
  fullWidth?: boolean;
};

export function QuizCardGrid<T extends string>({
  choices,
  value,
  onChange,
}: {
  choices: QuizChoice<T>[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {choices.map((choice) => (
        <QuizCard
          key={choice.id}
          flag={choice.flag}
          title={choice.label}
          description={choice.description}
          selected={value === choice.id}
          onClick={() => onChange(choice.id)}
          className={cn("w-full", choice.fullWidth && "md:col-span-2")}
        />
      ))}
    </div>
  );
}
