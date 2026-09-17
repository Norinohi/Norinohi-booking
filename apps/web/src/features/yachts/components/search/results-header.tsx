"use client";

import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { Select } from "@yacht-charter/ui/components/form/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@yacht-charter/ui/components/overlay/tooltip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { FilterChip } from "@/components/shared/form/filters";

import { PRICE_BASIS_OPTIONS, type PriceBasisOption } from "@/components/shared/form/filters";

/* Values only — sorting is query state, so a language change must never rewrite it. */
export const SORT_OPTIONS = ["recommended", "price-asc", "price-desc", "rating", "newest"] as const;

export type SortValue = (typeof SORT_OPTIONS)[number];

/** The Select hands back a bare string; only the values it was given name a sort. */
export function toSortValue(value: string | null): SortValue {
  return SORT_OPTIONS.find((option) => option === value) ?? "recommended";
}

export interface ResultsHeaderProps {
  chips: FilterChip[];
  onRemoveChip: (chip: FilterChip) => void;
  /** Absent until the first answer, so the header never claims "0 yachts found" while loading. */
  total?: number;
  sort: SortValue;
  onSortChange: (sort: SortValue) => void;
  priceBasis: PriceBasisOption;
  onPriceBasisChange: (basis: PriceBasisOption) => void;
  className?: string;
}

export default function ResultsHeader({
  chips,
  onRemoveChip,
  total,
  sort,
  onSortChange,
  priceBasis,
  onPriceBasisChange,
  className,
}: ResultsHeaderProps) {
  const t = useTranslations("Common");
  /* Controlled so a tap opens it too: hover alone never fires on a phone. */
  const [hintOpen, setHintOpen] = useState(false);

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

        <p
          className={cn(
            "text-sm font-medium leading-[1.3] text-natural-500",
            total === undefined && "invisible",
          )}
        >
          {t("resultsCount", { count: total ?? 0 })}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row md:shrink-0">
        <div className="flex items-center gap-1">
          <Tooltip open={hintOpen} onOpenChange={setHintOpen}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={t("priceBasis.hintLabel")}
                  onClick={() => setHintOpen(true)}
                  className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-natural-500 outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/40"
                />
              }
            >
              <Info className="size-5" />
            </TooltipTrigger>
            <TooltipContent className="flex max-w-80 flex-col gap-2 text-left">
              <span>
                <strong>{t("priceBasis.boat")}:</strong> {t("priceBasis.boatHint")}
              </span>
              <span>
                <strong>{t("priceBasis.charter")}:</strong> {t("priceBasis.charterHint")}
              </span>
            </TooltipContent>
          </Tooltip>
          <Select
            className="h-12 w-full md:w-auto md:min-w-57"
            ariaLabel={t("priceBasis.aria")}
            options={PRICE_BASIS_OPTIONS.map((value) => ({
              value,
              label: t(`priceBasis.${value}`),
            }))}
            value={priceBasis}
            onValueChange={(next) => {
              const picked = PRICE_BASIS_OPTIONS.find((option) => option === next);
              if (picked) onPriceBasisChange(picked);
            }}
            renderValue={(value) =>
              t("priceBasis.label", {
                value: t(
                  `priceBasis.${PRICE_BASIS_OPTIONS.find((option) => option === value) ?? "boat"}`,
                ),
              })
            }
          />
        </div>
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
