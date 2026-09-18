"use client";

import { buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import type { MapInstance } from "@/components/shared/map/map-canvas";
import { Link } from "@/i18n/navigation";

import {
  MARINA_PAGE_SIZE,
  mapMarinasQueryOptions,
  marinaListingsQueryOptions,
} from "../../api/queries";
import { useFitSearchResults } from "../../hooks/use-fit-search-results";
import { useListingCards } from "../../hooks/use-listing-cards";
import { useMapCameraUrl, useWriteCameraToUrl } from "../../hooks/use-map-camera-url";
import { useMapClusters } from "../../hooks/use-map-clusters";
import { useMapPadding } from "../../hooks/use-map-padding";
import { useMapSelection } from "../../hooks/use-map-selection";
import { useRememberSearch } from "../../hooks/use-remember-search";
import { useSearchFilters } from "../../hooks/use-search-filters";
import { useSearchInput } from "../../hooks/use-search-input";
import { serializeSearch } from "../../lib/search-params";
import MapBoatPopup from "./map-boat-popup";
import MapBoatSkeleton from "./map-boat-skeleton";
import MapChrome from "./map-chrome";
import MapStatus from "./map-status";
import MarinaLayer from "./marina-layer";

const MapCanvas = dynamic(() => import("@/components/shared/map/map-canvas"), {
  ssr: false,
  loading: () => <div className="size-full bg-natural-50" />,
});

export default function MapScreen() {
  useRememberSearch();
  const focusListingId = useSearchParams().get("selected");
  /* The same URL state the list screen runs on, so filters survive a reload and travel with a link
     instead of dying with the component. */
  const { filters, setFilters, defaults, searchParams } = useSearchFilters();
  const [listOpen, setListOpen] = useState(false);
  const [map, setMap] = useState<MapInstance | null>(null);

  const t = useTranslations("YachtsMap");
  const common = useTranslations("Common");
  const { toCard } = useListingCards();

  const { openingView, hasCamera, setCamera } = useMapCameraUrl();

  const input = useSearchInput(filters, defaults, { sort: "recommended", page: 1 });
  const { data, isPending, isPlaceholderData, isError, refetch } = useQuery(
    mapMarinasQueryOptions(input),
  );
  const searchKey = JSON.stringify(input);
  const marinas = data?.marinas ?? [];

  /* Effects run in the order these are called, and the order is load-bearing: the padding has to
     be on the map before the search is framed against it, and the camera writer attached only
     after that framing, so an arrival's jump is not written to the URL. */
  const { clusters, supercluster } = useMapClusters(marinas, map);
  const { shellRef, filtersRef, listRef, controlsRef } = useMapPadding(map, listOpen);
  /* The previous search's pins stay up while the next loads, but framing them would use up this
     search's one fit before its own answer arrived. */
  useFitSearchResults(
    map,
    searchKey,
    isPlaceholderData ? undefined : data?.marinas,
    hasCamera || Boolean(focusListingId),
  );
  useWriteCameraToUrl(map, setCamera);
  const selection = useMapSelection(map, supercluster, focusListingId, searchKey);
  const { selected, openMarina } = selection;

  /* The page holding the card on screen. Only that page is fetched, so opening a marina of three
     hundred costs the same as opening one of three. */
  const marinaPage = Math.floor(selection.marinaIndex / MARINA_PAGE_SIZE) + 1;
  const {
    data: marinaBoatsData,
    isError: marinaBoatsFailed,
    isPlaceholderData: marinaBoatsStale,
    refetch: refetchMarinaBoats,
  } = useQuery({
    /* By name, the way the pin was grouped: one marina can be two vendors' bases. */
    ...marinaListingsQueryOptions(input, openMarina?.values ?? [], marinaPage),
    enabled: Boolean(openMarina),
  });
  /* Previous data is kept while a page loads, which is right for paging one marina's card and
     wrong for the first page of another: that would show the last marina's boats under this pin. */
  const marinaBoats = marinaBoatsStale && marinaPage === 1 ? undefined : marinaBoatsData;

  // A popup covers the top-left controls on small screens, so we fade them out while one is open.
  const popupOpen = Boolean(selected || openMarina);

  /*
   * With a marina open, the list and the catalogue link narrow to its boats. "Show all list" used
   * to answer with every boat in the search while the card beside it said 1/11, and the only way
   * from the map to the catalogue dropped the marina the visitor had just chosen.
   */
  const listFilters = openMarina ? { ...filters, marina: openMarina.values } : filters;
  const catalogueHref = serializeSearch(
    "/yachts",
    openMarina ? { ...searchParams, marina: openMarina.values } : searchParams,
  );
  const catalogueLabel = openMarina ? t("viewInCatalogue") : t("backToSearch");

  return (
    <div className="flex h-dvh min-h-0 flex-col md:h-[calc(100dvh-var(--header-h))]">
      <div className="hidden px-4 py-3 md:block md:px-13.5 2xl:px-17.5">
        <Link href={catalogueHref} className={buttonVariants({ variant: "subtle", size: "sm" })}>
          <ArrowLeft />
          {catalogueLabel}
        </Link>
      </div>

      <div
        ref={shellRef}
        className={cn(
          "relative min-h-0 flex-1",
          // The popup covers the bottom-right zoom controls on phones (< 768px) the same way it
          // covers the chrome below, so they go with it and come back from md up.
          popupOpen && "[&_.mapboxgl-ctrl-group]:hidden md:[&_.mapboxgl-ctrl-group]:block",
        )}
      >
        <MapCanvas
          locateControl
          initialViewState={openingView}
          onReady={setMap}
          onBackgroundPress={selection.dismiss}
        >
          <MarinaLayer
            clusters={clusters}
            openBaseIds={openMarina?.baseIds ?? []}
            onOpenPlace={selection.openPlace}
            onPressCluster={selection.pressCluster}
          />

          {selected ? (
            <MapBoatPopup
              key={selected.id}
              coordinates={{ lat: selected.base.lat, lng: selected.base.lng }}
              boats={[toCard(selected, undefined, true)]}
              map={map}
              focusZoom={selection.selectedFocus?.focusZoom}
              focusDurationMs={selection.selectedFocus?.focusDurationMs}
              onFocusApplied={selection.focusApplied}
            />
          ) : openMarina && marinaBoats ? (
            <MapBoatPopup
              key={openMarina.baseIds.join()}
              coordinates={{ lat: openMarina.lat, lng: openMarina.lng }}
              boats={marinaBoats.items.map((item) => toCard(item.listing, item, true))}
              total={openMarina.count}
              pageStart={(marinaPage - 1) * MARINA_PAGE_SIZE}
              onActiveIndex={selection.setMarinaIndex}
              map={map}
              focusZoom={openMarina.focusZoom}
              focusDurationMs={openMarina.focusDurationMs}
              catalogueHref={catalogueHref}
            />
          ) : openMarina && !marinaBoatsFailed ? (
            /* The card's shape until its first page arrives, rather than an empty card with a pager
               reading "1 / 300" or nothing at all, which read as a missed click. */
            <MapBoatSkeleton
              key={openMarina.baseIds.join()}
              coordinates={{ lat: openMarina.lat, lng: openMarina.lng }}
              map={map}
            />
          ) : null}
        </MapCanvas>

        {/* A pin whose boats failed to load used to do nothing at all, which reads as a dead
            click rather than as a request worth retrying. */}
        {openMarina && !marinaBoats && marinaBoatsFailed && (
          <MapStatus onRetry={() => refetchMarinaBoats()} retryLabel={common("errors.retry")}>
            {common("errors.requestFailed")}
          </MapStatus>
        )}
        {!popupOpen &&
          (isPending || isPlaceholderData || isError || data?.marinas.length === 0) && (
            <MapStatus
              onRetry={isError ? () => refetch() : undefined}
              retryLabel={common("errors.retry")}
            >
              {isError
                ? common("errors.requestFailed")
                : isPending || isPlaceholderData
                  ? t("loading")
                  : t("noResults")}
            </MapStatus>
          )}

        <MapChrome
          filters={filters}
          defaults={defaults}
          onFiltersChange={setFilters}
          listFilters={listFilters}
          listOpen={listOpen}
          onListOpenChange={setListOpen}
          popupOpen={popupOpen}
          catalogueHref={catalogueHref}
          catalogueLabel={catalogueLabel}
          filtersRef={filtersRef}
          listRef={listRef}
          controlsRef={controlsRef}
        />
      </div>
    </div>
  );
}
