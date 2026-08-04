"use client";

import { buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { Search } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import BoatCard from "@/components/shared/data-display/boat-card";
import { Image } from "@/components/shared/data-display/image";
import EmptyState from "@/components/shared/feedback/empty-state";
import {
  clearFilterKeys,
  DEFAULT_FILTERS,
  type FilterChip,
  FiltersPanel,
  FiltersPopover,
  type FiltersState,
  useFilterChips,
} from "@/components/shared/form/filters";

import { useFillToFold } from "@/hooks/use-fill-to-fold";

import { useBoatCards } from "@/hooks/use-boat-cards";
import { getBoatsPage, RESULTS_PER_PAGE, RESULTS_TOTAL } from "@/lib/sample-boats";

import ResultsHeader, { type SortValue } from "./results-header";
import SearchBar from "./search-bar";

const YACHTS_MAP_HREF = "/yachts/map" as Route;

export default function SearchScreen() {
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortValue>("recommended");
  const [page, setPage] = useState(1);
  const filtersRef = useFillToFold("64rem");

  const t = useTranslations("Yachts");
  const { toSearchCard } = useBoatCards();
  const boats = getBoatsPage(page).map(toSearchCard);
  const chips = useFilterChips(filters);

  function applyFilters(next: FiltersState) {
    setFilters(next);
    setPage(1);
  }

  function removeChip(chip: FilterChip) {
    applyFilters(clearFilterKeys(filters, chip.keys));
  }

  return (
    <div className="flex flex-col">
      <div className="border-b border-natural-50 px-4 py-6 md:px-13.5">
        <SearchBar value={filters} onSearch={applyFilters} />
      </div>

      <div className=" w-full md:px-13.5 px-4 py-6">
        <div className="max-w-349  mx-auto grid w-full gap-5 lg:grid-cols-[334px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-5">
            <div className="relative flex h-47.5 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border p-6">
              <Image
                src="/assets/yachts/world-map.png"
                alt=""
                fill
                priority
                sizes="(min-width: 1024px) 334px, 100vw"
                className="object-cover"
              />
              <Link
                href={YACHTS_MAP_HREF}
                className={buttonVariants({ variant: "neutral", className: "relative capitalize" })}
              >
                <Search />
                {t("searchByMap")}
              </Link>
            </div>

            <div
              ref={filtersRef}
              className="hidden lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:flex lg:max-h-[calc(100dvh-var(--header-h)-3rem)] lg:flex-col"
            >
              <FiltersPanel
                scrollable
                className="min-h-0 flex-1"
                value={filters}
                onApply={applyFilters}
              />
            </div>
          </aside>

          <div className="flex min-w-0 flex-col gap-5">
            <FiltersPopover className="lg:hidden" value={filters} onApply={applyFilters} />

            <ResultsHeader
              chips={chips}
              onRemoveChip={removeChip}
              total={RESULTS_TOTAL}
              sort={sort}
              onSortChange={setSort}
            />

            {boats.length === 0 ? (
              <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
            ) : (
              boats.map(({ id, ...boat }, index) => (
                <BoatCard key={id} {...boat} priority={index === 0} />
              ))
            )}

            <PaginationControl
              className="pt-1"
              page={page}
              pageSize={RESULTS_PER_PAGE}
              total={RESULTS_TOTAL}
              onPageChange={setPage}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
