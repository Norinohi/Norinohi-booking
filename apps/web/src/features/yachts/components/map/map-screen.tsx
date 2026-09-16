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
  const { toMapCard } = useListingCards();

  const { openingView, hasCamera, setCamera } = useMapCameraUrl();

  const input = useSearchInput(filters, defaults, { sort: "recommended", page: 1 });
  const { data, isPending, isError, refetch } = useQuery(mapMarinasQueryOptions(input));
  const searchKey = JSON.stringify(input);
  const marinas = data?.marinas ?? [];

  /* Effects run in the order these are called, and the order is load-bearing: the padding has to
     be on the map before the search is framed against it, and the camera writer attached only
     after that framing, so an arrival's jump is not written to the URL. */
  const { clusters, supercluster } = useMapClusters(marinas, map);
  const { shellRef, filtersRef, listRef } = useMapPadding(map, listOpen);
  useFitSearchResults(map, searchKey, data?.marinas, hasCamera || Boolean(focusListingId));
  useWriteCameraToUrl(map, setCamera);
  const selection = useMapSelection(map, supercluster, focusListingId, searchKey);
  const { selected, openMarina } = selection;

  /* The page holding the card on screen. Only that page is fetched, so opening a marina of three
     hundred costs the same as opening one of three. */
  const marinaPage = Math.floor(selection.marinaIndex / MARINA_PAGE_SIZE) + 1;
  const {
    data: marinaBoats,
    isError: marinaBoatsFailed,
    refetch: refetchMarinaBoats,
  } = useQuery({
    /* By name, the way the pin was grouped: one marina can be two vendors' bases. */
    ...marinaListingsQueryOptions(input, openMarina?.values ?? [], marinaPage),
    enabled: Boolean(openMarina),
  });

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
              boats={[toMapCard(selected)]}
              map={map}
              focusZoom={selection.selectedFocus?.focusZoom}
              focusDurationMs={selection.selectedFocus?.focusDurationMs}
              onFocusApplied={selection.focusApplied}
            />
          ) : openMarina && marinaBoats ? (
            /* Held back until the first page is in hand: an empty card with a pager reading "1 / 300"
               is worse than the blink of waiting for it. */
            <MapBoatPopup
              key={openMarina.baseIds.join()}
              coordinates={{ lat: openMarina.lat, lng: openMarina.lng }}
              boats={marinaBoats.items.map((item) => toMapCard(item.listing, item))}
              total={openMarina.count}
              pageStart={(marinaPage - 1) * MARINA_PAGE_SIZE}
              onActiveIndex={selection.setMarinaIndex}
              map={map}
              focusZoom={openMarina.focusZoom}
              focusDurationMs={openMarina.focusDurationMs}
              catalogueHref={catalogueHref}
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
        {!popupOpen && (isPending || isError || data?.marinas.length === 0) && (
          <MapStatus
            onRetry={isError ? () => refetch() : undefined}
            retryLabel={common("errors.retry")}
          >
            {isError ? common("errors.requestFailed") : isPending ? t("loading") : t("noResults")}
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
        />
      </div>
    </div>
  );
}
