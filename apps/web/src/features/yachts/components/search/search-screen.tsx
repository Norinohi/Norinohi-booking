"use client";

import { buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Image } from "@/components/shared/image";
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

import { getBoatsPage, RESULTS_PER_PAGE, RESULTS_TOTAL } from "../../lib/sample-boats";

import BoatCard from "./boat-card";
import ResultsHeader, { type SortValue } from "./results-header";
import SearchBar from "./search-bar";

export default function SearchScreen() {
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
            <div className="relative flex h-47.5 items-center justify-center overflow-hidden rounded-2xl border border-border p-6">
              <Image
                src="/assets/yachts/world-map.png"
                alt=""
                fill
                priority
                sizes="(min-width: 1024px) 334px, 100vw"
                className="object-cover"
              />
              <Link
                href="/yachts/map"
                className={buttonVariants({ variant: "neutral", className: "relative capitalize" })}
              >
                <Search />
                Search by map
              </Link>
            </div>

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
