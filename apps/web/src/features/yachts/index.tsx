"use client";

import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { useState } from "react";

import {
  clearFilterKeys,
  DEFAULT_FILTERS,
  type FilterChip,
  FiltersPanel,
  FiltersPopover,
  type FiltersState,
  getFilterChips,
} from "@/components/shared/filters";
import EmptyState from "@/components/shared/empty-state";

import BoatCard from "./components/boat-card";
import MapCard from "./components/map-card";
import ResultsHeader, { type SortValue } from "./components/results-header";
import SearchBar from "./components/search-bar";
import { getBoatsPage, RESULTS_PER_PAGE, RESULTS_TOTAL } from "./lib/sample-boats";

export default function YachtsWrapper() {
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [sort, setSort] = useState<SortValue>("recommended");
  const [page, setPage] = useState(1);

  const boats = getBoatsPage(page);
  const chips = getFilterChips(filters);

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
            <MapCard />
            <FiltersPanel className="hidden lg:flex" value={filters} onApply={applyFilters} />
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
              <EmptyState
                title="No yachts found for your filters"
                description="Try adjusting your dates, budget, or location — we’ll help you find the perfect match."
              />
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
