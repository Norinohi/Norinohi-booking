"use client";

import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { Select } from "@yacht-charter/ui/components/form/select";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";

import type { FilterChip } from "@/components/shared/form/filters";

/* Values only — sorting is query state, so a language change must never rewrite it. */
export const SORT_OPTIONS = ["recommended", "price-asc", "price-desc", "rating", "newest"] as const;

export type SortValue = (typeof SORT_OPTIONS)[number];

/** The Select hands back a bare string; only the values it was given name a sort. */
export function toSortValue(value: string | null): SortValue {
  return SORT_OPTIONS.find((option) => option === value) ?? "recommended";
}

export type ResultsHeaderProps = {
  chips: FilterChip[];
  onRemoveChip: (chip: FilterChip) => void;
  total: number;
  sort: SortValue;
  onSortChange: (sort: SortValue) => void;
  className?: string;
};

export default function ResultsHeader({
  chips,
  onRemoveChip,
  total,
  sort,
  onSortChange,
  className,
}: ResultsHeaderProps) {
  const t = useTranslations("Common");

  return (
    <div
      className={cn("flex flex-col gap-4 md:flex-row md:items-start md:justify-between", className)}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {chips.length ? (
          <div className="flex flex-wrap items-start gap-2">
            {chips.map((chip) => (
              <Chip
                key={chip.id}
                variant="outline"
                onRemove={() => onRemoveChip(chip)}
                removeLabel={t("removeFilter", { label: chip.label })}
              >
                {chip.label}
              </Chip>
            ))}
          </div>
        ) : null}

        <p className="text-sm font-medium leading-[1.3] text-natural-500">
          {t("resultsCount", { count: total })}
        </p>
      </div>

      <div className="md:shrink-0">
        <Select
          className="h-12 w-full md:w-auto md:min-w-57"
          options={SORT_OPTIONS.map((value) => ({ value, label: t(`sorting.${value}`) }))}
          value={sort}
          onValueChange={(next) => onSortChange(toSortValue(next))}
          renderValue={(value) => t("sorting.label", { value: t(`sorting.${toSortValue(value)}`) })}
        />
      </div>
    </div>
  );
}
