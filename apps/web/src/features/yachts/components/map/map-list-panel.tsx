"use client";

import { Select } from "@yacht-charter/ui/components/form/select";
import { ScrollArea } from "@yacht-charter/ui/components/layout/scroll-area";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useState } from "react";

import Loader from "@/components/shared/feedback/loader";
import type { FiltersState } from "@/components/shared/form/filters";

import { resultsQueryOptions } from "../../api/queries";
import { useListingCards } from "../../hooks/use-listing-cards";
import { useSearchInput } from "../../hooks/use-search-input";
import { SORT_OPTIONS, type SortValue } from "../search/results-header";
import MapBoatCard from "./map-boat-card";

export type MapListPanelProps = {
  filters: FiltersState;
  defaults: FiltersState;
  className?: string;
};

export default function MapListPanel({ filters, defaults, className }: MapListPanelProps) {
  const t = useTranslations("Common");
  const { toMapCard } = useListingCards();
  const [sort, setSort] = useState<SortValue>("recommended");
  const [page, setPage] = useState(1);

  const [appliedFilters, setAppliedFilters] = useState(filters);
  if (appliedFilters !== filters) {
    setAppliedFilters(filters);
    setPage(1);
  }

  const input = useSearchInput(filters, defaults, { sort, page });
  const { data, isLoading } = useQuery(resultsQueryOptions(input));
  const boats = data?.items.map(({ listing }) => toMapCard(listing)) ?? [];
  const pagination = data?.pagination;

  return (
    <section
      className={cn(
        "flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card md:w-80 md:shrink-0",
        className,
      )}
    >
      <div className="flex shrink-0 flex-col gap-3 border-b border-border p-4">
        <p className="text-sm font-medium leading-[1.3] text-natural-500">
          {t("resultsCount", { count: pagination?.totalItems ?? 0 })}
        </p>

        <Select
          className="h-12 w-full min-w-0"
          options={SORT_OPTIONS.map((value) => ({ value, label: t(`sorting.${value}`) }))}
          value={sort}
          onValueChange={(next) => setSort((next ?? "recommended") as SortValue)}
          renderValue={(value) => t("sorting.label", { value: t(`sorting.${value as SortValue}`) })}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 p-4">
          {isLoading ? <Loader /> : boats.map((boat) => <MapBoatCard key={boat.id} {...boat} />)}
        </div>
      </ScrollArea>

      {pagination && pagination.totalItems > 0 ? (
        <div className="shrink-0 border-t border-border py-4">
          <PaginationControl
            page={page}
            pageSize={pagination.pageSize}
            total={pagination.totalItems}
            onPageChange={setPage}
            summary={false}
            className="justify-center"
          />
        </div>
      ) : null}
    </section>
  );
}
