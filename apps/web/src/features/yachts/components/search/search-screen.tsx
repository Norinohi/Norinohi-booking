"use client";

import { buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, Suspense, useMemo } from "react";
import { Link, useRouter } from "@/i18n/navigation";
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
import { serializeSearch } from "../../lib/search-params";
import ResultsHeader, { SORT_OPTIONS, type SortValue } from "./results-header";
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

/**
 * The facet a catalogue page pins from its path, and whether an edit has just dropped it.
 *
 * Keys are compared by containment rather than equality: adding a second country to
 * `/yacht-charter/croatia` is a refinement and stays on the page, removing Croatia is not.
 */
const LOCKABLE_KEYS = ["country", "sailingArea", "city", "marina", "boatType", "model"] as const;

export type LockedFilters = Partial<Pick<FiltersState, (typeof LOCKABLE_KEYS)[number]>>;

function escapesLock(next: FiltersState, locked: LockedFilters): boolean {
  return LOCKABLE_KEYS.some(
    (key) => locked[key]?.some((value) => !next[key].includes(value)) === true,
  );
}

/**
 * Sort and page, and the rule that ties them together: a page belongs to the result set it was
 * picked from, so anything that changes the request returns to the first one.
 */
function useResultOrder() {
  const [sort, setSortParam] = useQueryState(
    "sort",
    parseAsStringLiteral(SORT_OPTIONS).withDefault("recommended"),
  );
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  return {
    sort,
    page,
    setPage,
    firstPage: () => void setPage(1),
    setSort: (next: SortValue) => {
      void setSortParam(next);
      void setPage(1);
    },
  };
}

/** Applies a filter change and returns to page 1 — shared by the three filter surfaces. */
function useApplyFilters(locked?: LockedFilters) {
  const { filters: url, setFilters, defaults } = useSearchFilters();
  const { firstPage } = useResultOrder();
  const router = useRouter();

  /* Memoised: `useDraft` in the filters panel follows the applied value by reference, so a fresh
   * object every render would discard an edit in progress. */
  const filters = useMemo(() => (locked ? { ...url, ...locked } : url), [url, locked]);

  function applyFilters(next: FiltersState) {
    /*
     * Dropping one of a catalogue page's own filters means leaving it: the path says Croatia, so
     * staying would leave the URL claiming something the results no longer honour. The rest of
     * the filters travel along as query params.
     */
    if (locked && escapesLock(next, locked)) {
      router.push(serializeSearch("/yachts", next));
      return;
    }

    setFilters(next);
    firstPage();
  }

  return { filters, defaults, applyFilters };
}

function SearchBarSection({ locked }: { locked?: LockedFilters }) {
  const { filters, applyFilters } = useApplyFilters(locked);

  return <SearchBar value={filters} onSearch={applyFilters} />;
}

function FiltersAside({ locked }: { locked?: LockedFilters }) {
  const { filters, applyFilters } = useApplyFilters(locked);
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

function ResultsColumn({ locked }: { locked?: LockedFilters }) {
  const t = useTranslations("Yachts");
  const { filters, defaults, applyFilters } = useApplyFilters(locked);
  const { sort, setSort, page, setPage } = useResultOrder();

  const { toCard } = useListingCards();
  const input = useSearchInput(filters, defaults, { sort, page });
  const { data, isLoading } = useQuery(resultsQueryOptions(input));
  const boats = data?.items.map((item) => toCard(item.listing, item)) ?? [];
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

/**
 * The search screen, and the catalogue pages under `/yacht-charter` and `/shipyard`.
 *
 * One screen for both, so a visitor arriving from a search engine lands on the interface the rest
 * of the site uses rather than a page that only looks like it. The catalogue pages differ by what
 * they pass in, not by what they render.
 */
export default function SearchScreen({
  heading,
  locked,
  resultsFallback,
  footer,
}: {
  /** Overrides the page heading; a catalogue page names itself after its own facet. */
  heading?: string;
  /** The facet pinned by the path. Merged into every filter surface. */
  locked?: LockedFilters;
  /**
   * Server-rendered cards shown until the client query resolves.
   *
   * This is what puts boats in the HTML. `ResultsColumn` reads the URL and fetches on the client,
   * so on the server it never resolves and the boundary's fallback is what a crawler receives —
   * a spinner on `/yachts`, and the page's own listings on a catalogue page.
   */
  resultsFallback?: ReactNode;
  /** Rendered under the results. The catalogue pages put their sibling links here. */
  footer?: ReactNode;
}) {
  const t = useTranslations("Yachts");

  return (
    <div className="flex flex-col">
      <div className="border-b border-natural-50 px-4 py-6 md:px-13.5">
        {/* Screen-reader only: the design has no slot for a page heading here. Outside the
            boundary all the same, or it never reaches the HTML a crawler receives. */}
        <h1 className="sr-only">{heading ?? t("heading")}</h1>
        <Suspense fallback={null}>
          <SearchBarSection locked={locked} />
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
              <FiltersAside locked={locked} />
            </Suspense>
          </aside>

          <div className="flex min-w-0 flex-col gap-5">
            {/* `Loader` is the component's own pending UI, reused rather than a new skeleton. */}
            <Suspense fallback={resultsFallback ?? <Loader />}>
              <ResultsColumn locked={locked} />
            </Suspense>

            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}
