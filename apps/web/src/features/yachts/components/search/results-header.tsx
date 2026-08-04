"use client";

import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yacht-charter/ui/components/form/select";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";

import type { FilterChip } from "@/components/shared/form/filters";

/* Values only — sorting is query state, so a language change must never rewrite it. */
export const SORT_OPTIONS = ["recommended", "price-asc", "price-desc", "rating", "newest"] as const;

export type SortValue = (typeof SORT_OPTIONS)[number];

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
          value={sort}
          onValueChange={(next) => onSortChange((next ?? "recommended") as SortValue)}
        >
          <SelectTrigger className="h-12 w-full md:w-auto md:min-w-57">
            <SelectValue>
              {(value) => t("sorting.label", { value: t(`sorting.${value as SortValue}`) })}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`sorting.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
