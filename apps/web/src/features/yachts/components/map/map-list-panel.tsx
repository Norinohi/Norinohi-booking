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
import { useState } from "react";

import { getBoatsPage, RESULTS_PER_PAGE, RESULTS_TOTAL } from "../../lib/sample-boats";
import { SORT_OPTIONS, type SortValue } from "../search/results-header";

import MapBoatCard from "./map-boat-card";

const SORT_LABELS: Record<string, string> = Object.fromEntries(
  SORT_OPTIONS.map(({ value, label }) => [value, label]),
);

export type MapListPanelProps = {
  className?: string;
};

export default function MapListPanel({ className }: MapListPanelProps) {
  const [sort, setSort] = useState<SortValue>("recommended");
  const [page, setPage] = useState(1);

  const boats = getBoatsPage(page);

  return (
    <section
      className={cn(
        "flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card md:w-80 md:shrink-0",
        className,
      )}
    >
      <div className="flex shrink-0 flex-col gap-3 border-b border-border p-4">
        <p className="text-sm font-medium leading-[1.3] text-natural-500">
          {RESULTS_TOTAL} yachts found
        </p>

        <Select
          value={sort}
          onValueChange={(next) => setSort((next ?? "recommended") as SortValue)}
        >
          <SelectTrigger className="h-12 w-full min-w-0">
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
