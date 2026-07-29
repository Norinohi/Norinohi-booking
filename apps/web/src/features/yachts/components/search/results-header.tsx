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

import type { FilterChip } from "@/components/shared/filters";

export const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "rating", label: "Guest rating" },
  { value: "newest", label: "Newest first" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

const SORT_LABELS: Record<string, string> = Object.fromEntries(
  SORT_OPTIONS.map(({ value, label }) => [value, label]),
);

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
                removeLabel={`Remove filter ${chip.label}`}
              >
                {chip.label}
              </Chip>
            ))}
          </div>
        ) : null}

        <p className="text-sm font-medium leading-[1.3] text-natural-500">{total} yachts found</p>
      </div>

      <div className="md:shrink-0">
        <Select
          value={sort}
          onValueChange={(next) => onSortChange((next ?? "recommended") as SortValue)}
        >
          <SelectTrigger className="h-12 w-full md:w-auto md:min-w-57">
            <SelectValue>{(value) => `Sort by: ${SORT_LABELS[value as string]}`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
