"use client";

import { Button, buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, X } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";

import {
  clearFilterKeys,
  type FilterChip,
  FiltersPanel,
  FiltersPopover,
  type FiltersState,
  useFilterChips,
  useFilterRanges,
} from "@/components/shared/form/filters";

import { type MapMarkerData, mapMarkersQueryOptions } from "../../api/queries";
import { useListingCards } from "../../hooks/use-listing-cards";
import { useMapClusters } from "../../hooks/use-map-clusters";
import { useSearchInput } from "../../hooks/use-search-input";
import MapBoatPopup from "./map-boat-popup";
import type { MapInstance } from "@/components/shared/data-display/map-canvas";
import MapClusterMarker from "./map-cluster-marker";
import MapListPanel from "./map-list-panel";
import MapMarker from "@/components/shared/data-display/map-marker";

// Above this expansion zoom a cluster is a single marina whose boats never separate; list them instead.
const CLUSTER_EXPAND_MAX_ZOOM = 16;

// Zoom the map settles on when arriving from a listing's "See on map" deep link.
const DETAIL_FOCUS_ZOOM = 11;

type OpenCluster = { lng: number; lat: number; leaves: MapMarkerData[] };

const MapCanvas = dynamic(() => import("@/components/shared/data-display/map-canvas"), {
  ssr: false,
  loading: () => <div className="size-full bg-natural-50" />,
});

function CloseListButton({
  onClick,
  label,
  className,
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="neutral"
      size="icon"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "pointer-events-auto size-12 shadow-[4px_4px_15px_rgba(47,128,237,0.15)] md:size-11",
        className,
      )}
    >
      <X />
    </Button>
  );
}

export default function MapScreen() {
  const focusListingId = useSearchParams().get("selected");
  const { defaults } = useFilterRanges();
  const [filters, setFilters] = useState<FiltersState>(() => defaults);
  const [listOpen, setListOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(focusListingId);
  const [openCluster, setOpenCluster] = useState<OpenCluster | null>(null);
  const [map, setMap] = useState<MapInstance | null>(null);
  const [focusDone, setFocusDone] = useState(false);

  const t = useTranslations("YachtsMap");
  const common = useTranslations("Common");
  const { toMapCard } = useListingCards();
  const chips = useFilterChips(filters);

  const input = useSearchInput(filters, defaults, { sort: "recommended", page: 1 });
  const { data } = useQuery(mapMarkersQueryOptions(input));
  const markers = data?.markers ?? [];

  const { clusters, supercluster } = useMapClusters(markers, map);

  const selected = selectedListingId
    ? markers.find((marker) => marker.listingId === selectedListingId)
    : undefined;

  // A popup covers the top-left controls on small screens, so we fade them out while one is open.
  const popupOpen = Boolean(selected || openCluster);

  function selectListing(listingId: string) {
    setOpenCluster(null);
    setSelectedListingId(listingId);
  }

  function dismissOverlays() {
    setSelectedListingId(null);
    setOpenCluster(null);
  }

  // Clicking a cluster: zoom in to split it, unless its boats sit on one marina (expansion zoom past
  // the cap) and can never separate — then list them in a popup instead of flying into empty water.
  function pressCluster(clusterId: number, lng: number, lat: number) {
    setSelectedListingId(null);
    const expansionZoom = supercluster.getClusterExpansionZoom(clusterId);
    if (map && expansionZoom <= CLUSTER_EXPAND_MAX_ZOOM) {
      setOpenCluster(null);
      // At low zoom a spread cluster's split point can sit only a fraction above the current zoom,
      // so easeTo(expansionZoom) alone barely moves. Zoom in by a decisive step so the cluster
      // visibly breaks apart. Called from the marker's onClick (after touchend), so mapbox no longer
      // cancels the animation mid-flight.
      const targetZoom = Math.min(
        Math.max(expansionZoom, Math.floor(map.getZoom()) + 2),
        CLUSTER_EXPAND_MAX_ZOOM,
      );
      map.easeTo({ center: [lng, lat], zoom: targetZoom });
      return;
    }
    const leaves = supercluster.getLeaves(clusterId, Infinity).map((leaf) => leaf.properties);
    setOpenCluster({ lng, lat, leaves });
  }

  // Sync the selection with the deep-link param. On a soft nav back to an already-mounted map (Next 16
  // keeps the route alive via Activity), the `useState` initializer above does not re-run for the new
  // URL — so open the target's popup here and re-arm the one-time focus zoom.
  useEffect(() => {
    if (!focusListingId) return;
    setSelectedListingId(focusListingId);
    setOpenCluster(null);
    setFocusDone(false);
  }, [focusListingId]);

  // Deep link from a listing's "See on map": the target boat's popup opens (selectedListingId is
  // seeded from the URL) and, the first time it does, its open animation also zooms in — one motion,
  // instead of a flyTo that the popup's own recenter would immediately override. Consumed once so a
  // later tap on the same boat doesn't yank the zoom back out.
  const detailFocusZoom =
    !focusDone && focusListingId && selected?.listingId === focusListingId
      ? DETAIL_FOCUS_ZOOM
      : undefined;

  useEffect(() => {
    if (detailFocusZoom != null) setFocusDone(true);
  }, [detailFocusZoom]);

  function removeChip(chip: FilterChip) {
    setFilters(clearFilterKeys(filters, chip.keys, defaults));
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="px-4 py-3 md:px-13.5 2xl:px-[70px]">
        <Link href="/yachts" className={buttonVariants({ variant: "subtle", size: "sm" })}>
          <ArrowLeft />
          {t("backToSearch")}
        </Link>
      </div>

      <div
        className={cn(
          "relative min-h-0 flex-1",
          // The popup covers the bottom-right zoom controls on phones (< 768px) the same way it
          // covers the chrome below, so they go with it and come back from md up.
          popupOpen && "[&_.mapboxgl-ctrl-group]:hidden md:[&_.mapboxgl-ctrl-group]:block",
        )}
      >
        <MapCanvas locateControl onReady={setMap} onBackgroundPress={dismissOverlays}>
          {clusters.map((feature, index) => {
            const [lng, lat] = feature.geometry.coordinates;

            if ("cluster" in feature.properties && feature.properties.cluster) {
              const { cluster_id: clusterId, point_count: count } = feature.properties;
              return (
                <MapClusterMarker
                  key={`cluster-${clusterId}`}
                  coordinates={{ lat, lng }}
                  count={count}
                  label={t("clusterCount", { count })}
                  order={index}
                  onSelect={() => pressCluster(clusterId, lng, lat)}
                />
              );
            }

            const marker = feature.properties;
            return (
              <MapMarker
                key={marker.listingId}
                coordinates={{ lat, lng }}
                label={marker.title}
                selected={marker.listingId === selectedListingId}
                order={index}
                onSelect={() => selectListing(marker.listingId)}
              />
            );
          })}

          {selected ? (
            <MapBoatPopup
              key={selected.listingId}
              coordinates={{ lat: selected.lat, lng: selected.lng }}
              boats={[toMapCard(selected.listing)]}
              map={map}
              focusZoom={detailFocusZoom}
            />
          ) : openCluster ? (
            <MapBoatPopup
              key={openCluster.leaves[0]?.listingId}
              coordinates={{ lat: openCluster.lat, lng: openCluster.lng }}
              boats={openCluster.leaves.map((leaf) => toMapCard(leaf.listing))}
              map={map}
            />
          ) : null}
        </MapCanvas>

        <div className="pointer-events-none absolute inset-0 flex flex-col gap-4 px-4 pt-6 pb-8 md:gap-5 md:px-13.5 2xl:flex-row 2xl:items-start 2xl:px-[70px] 2xl:pb-[70px]">
          <div
            className={cn(
              "flex flex-col gap-4 transition-opacity duration-200 md:flex-row md:items-start md:gap-5 2xl:contents",
              // Popup covers these on phones (< 768px): fade out and disable there, keep them from md up.
              popupOpen &&
                "pointer-events-none opacity-0 [&_*]:pointer-events-none md:pointer-events-auto md:opacity-100 md:[&_*]:pointer-events-auto",
            )}
          >
            <FiltersPanel
              scrollable
              value={filters}
              onApply={setFilters}
              className="pointer-events-auto hidden max-h-full w-83.5 shrink-0 2xl:flex"
            />
            <FiltersPopover
              variant="primary"
              value={filters}
              onApply={setFilters}
              className="pointer-events-auto 2xl:hidden"
            />

            <div
              className={cn(
                "grid items-start gap-4 md:contents",
                listOpen ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1",
              )}
            >
              <Button
                type="button"
                variant="neutral"
                onClick={() => setListOpen((open) => !open)}
                className={cn(
                  "pointer-events-auto w-full capitalize shadow-[4px_4px_15px_rgba(47,128,237,0.15)] md:w-auto",
                  listOpen && "2xl:hidden",
                )}
              >
                {t("showAllList")}
              </Button>
              {listOpen ? (
                <CloseListButton
                  onClick={() => setListOpen(false)}
                  label={t("closeList")}
                  className="md:hidden"
                />
              ) : null}
            </div>

            {chips.length > 0 && (
              <div className="flex flex-wrap items-start justify-end gap-2 md:min-w-0 md:flex-1 2xl:order-last 2xl:justify-start [&>*]:pointer-events-auto">
                {chips.map((chip) => (
                  <Chip
                    key={chip.id}
                    variant="outline"
                    onRemove={() => removeChip(chip)}
                    removeLabel={common("removeFilter", { label: chip.label })}
                    className="bg-card"
                  >
                    {chip.label}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {listOpen ? (
            <div className="flex min-h-0 flex-1 items-start gap-4 2xl:contents">
              <MapListPanel
                filters={filters}
                defaults={defaults}
                className="pointer-events-auto max-h-full"
              />
              <CloseListButton
                onClick={() => setListOpen(false)}
                label={t("closeList")}
                className="hidden md:inline-flex"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
