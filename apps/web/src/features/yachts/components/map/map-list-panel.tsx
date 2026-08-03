"use client";

import { ScrollArea } from "@yacht-charter/ui/components/layout/scroll-area";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yacht-charter/ui/components/form/select";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useBoatCards } from "@/hooks/use-boat-cards";
import { getBoatsPage, RESULTS_PER_PAGE, RESULTS_TOTAL } from "@/lib/sample-boats";
import { SORT_OPTIONS, type SortValue } from "../search/results-header";

import MapBoatCard from "./map-boat-card";

export type MapListPanelProps = {
  className?: string;
};

export default function MapListPanel({ className }: MapListPanelProps) {
  const t = useTranslations("Common");
  const { toMapCard } = useBoatCards();
  const [sort, setSort] = useState<SortValue>("recommended");
  const [page, setPage] = useState(1);

  const boats = getBoatsPage(page).map(toMapCard);

  return (
    <section
      className={cn(
        "flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card md:w-80 md:shrink-0",
        className,
      )}
    >
      <div className="flex shrink-0 flex-col gap-3 border-b border-border p-4">
        <p className="text-sm font-medium leading-[1.3] text-natural-500">
          {t("resultsCount", { count: RESULTS_TOTAL })}
        </p>

        <Select
          value={sort}
          onValueChange={(next) => setSort((next ?? "recommended") as SortValue)}
        >
          <SelectTrigger className="h-12 w-full min-w-0">
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

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          {boats.map(({ id, ...boat }) => (
            <MapBoatCard key={id} {...boat} />
          ))}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border py-4">
        <PaginationControl
          page={page}
          pageSize={RESULTS_PER_PAGE}
          total={RESULTS_TOTAL}
          onPageChange={setPage}
          summary={false}
          className="justify-center"
        />
      </div>
    </section>
  );
}
