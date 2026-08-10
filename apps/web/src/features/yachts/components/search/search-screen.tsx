"use client";

import { buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { parseAsInteger, parseAsStringLiteral, useQueryState } from "nuqs";

import BoatCard from "@/components/shared/data-display/boat-card";
import { Image } from "@/components/shared/data-display/image";
import EmptyState from "@/components/shared/feedback/empty-state";
import Loader from "@/components/shared/feedback/loader";
import {
  clearFilterKeys,
  type FilterChip,
  FiltersPanel,
  FiltersPopover,
  type FiltersState,
  useFilterChips,
} from "@/components/shared/form/filters";

import { useFillToFold } from "@/hooks/use-fill-to-fold";

import { resultsQueryOptions } from "../../api/queries";
import { useListingCards } from "../../hooks/use-listing-cards";
import { useSearchFilters } from "../../hooks/use-search-filters";
import { useSearchInput } from "../../hooks/use-search-input";
import ResultsHeader, { SORT_OPTIONS } from "./results-header";
import SearchBar from "./search-bar";

const YACHTS_MAP_HREF = "/yachts/map";

/*
 * This screen is split three ways on purpose.
 *
 * Everything that reads the URL — filters, sort, page — goes through nuqs, which reads
 * `useSearchParams`, and `useQuery` reads the clock. Either bars a component from the prerendered
 * shell. So each URL-reading region sits in its own boundary and the surrounding structure — the
 * grid, and the static "search by map" card — prerenders and commits immediately.
 *
 * The result set itself genuinely cannot be prerendered: it is a function of the URL, and there is
 * no single shell that would be correct for every filter combination. What the boundary buys is
 * that the page frame paints at once instead of after a database round trip.
 */

/** Applies a filter change and returns to page 1 — shared by the three filter surfaces. */
function useApplyFilters() {
  const { filters, setFilters, defaults } = useSearchFilters();
  const [, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  function applyFilters(next: FiltersState) {
    setFilters(next);
    setPage(1);
  }

  return { filters, defaults, applyFilters };
}

function SearchBarSection() {
  const { filters, applyFilters } = useApplyFilters();

  return <SearchBar value={filters} onSearch={applyFilters} />;
}

function FiltersAside() {
  const { filters, applyFilters } = useApplyFilters();
  const filtersRef = useFillToFold("64rem");

  return (
    <div
      ref={filtersRef}
      className="hidden lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:flex lg:max-h-[calc(100dvh-var(--header-h)-3rem)] lg:flex-col"
    >
      <FiltersPanel scrollable className="min-h-0 flex-1" value={filters} onApply={applyFilters} />
    </div>
  );
}

function ResultsColumn() {
  const t = useTranslations("Yachts");
  const { filters, defaults, applyFilters } = useApplyFilters();
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringLiteral(SORT_OPTIONS).withDefault("recommended"),
  );
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  const { toCard } = useListingCards();
  const input = useSearchInput(filters, defaults, { sort, page });
  const { data, isLoading } = useQuery(resultsQueryOptions(input));
  const boats = data?.items.map(({ listing }) => toCard(listing)) ?? [];
  const pagination = data?.pagination;
  const chips = useFilterChips(filters);

  function removeChip(chip: FilterChip) {
    applyFilters(clearFilterKeys(filters, chip.keys, defaults));
  }

  return (
    <>
      <FiltersPopover className="lg:hidden" value={filters} onApply={applyFilters} />

      <ResultsHeader
        chips={chips}
        onRemoveChip={removeChip}
        total={pagination?.totalItems ?? 0}
        sort={sort}
        onSortChange={setSort}
      />

      {isLoading ? (
        <Loader />
      ) : boats.length === 0 ? (
        <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        boats.map((boat, index) => <BoatCard key={boat.id} {...boat} priority={index === 0} />)
      )}

      {pagination && pagination.totalItems > 0 ? (
        <PaginationControl
          className="pt-1"
          page={page}
          pageSize={pagination.pageSize}
          total={pagination.totalItems}
          onPageChange={setPage}
        />
      ) : null}
    </>
  );
}

export default function SearchScreen() {
  const t = useTranslations("Yachts");

  return (
    <div className="flex flex-col">
      <div className="border-b border-natural-50 px-4 py-6 md:px-13.5">
        <Suspense fallback={null}>
          <SearchBarSection />
        </Suspense>
      </div>

      <div className=" w-full md:px-13.5 px-4 py-6">
        <div className="max-w-349  mx-auto grid w-full gap-5 lg:grid-cols-[334px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-5">
            {/* Static: no URL or query dependency, so it prerenders and is the shell's anchor. */}
            <div
              data-testid="yachts-shell-marker"
              className="relative flex h-47.5 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border p-6"
            >
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

            <Suspense fallback={null}>
              <FiltersAside />
            </Suspense>
          </aside>

          <div className="flex min-w-0 flex-col gap-5">
            {/* `Loader` is the component's own pending UI, reused rather than a new skeleton. */}
            <Suspense fallback={<Loader />}>
              <ResultsColumn />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
