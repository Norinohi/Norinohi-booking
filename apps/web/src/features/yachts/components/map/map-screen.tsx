"use client";

import { Button, buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, X } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { throttle, useQueryStates } from "nuqs";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";

import {
  clearFilterKeys,
  type FilterChip,
  FiltersPanel,
  FiltersPopover,
  useFilterChips,
} from "@/components/shared/form/filters";

import { type MapMarkerData, mapMarkersQueryOptions } from "../../api/queries";
import { useListingCards } from "../../hooks/use-listing-cards";
import { useMapClusters } from "../../hooks/use-map-clusters";
import { useSearchFilters } from "../../hooks/use-search-filters";
import { useSearchInput } from "../../hooks/use-search-input";
import { boundsOf, paddingOf } from "../../lib/map-camera";
import { mapCameraParsers } from "../../lib/search-params";
import MapBoatPopup from "./map-boat-popup";
import type { MapInstance } from "@/components/shared/data-display/map-canvas";
import MapClusterMarker from "./map-cluster-marker";
import MapListPanel from "./map-list-panel";
import MapMarker from "@/components/shared/data-display/map-marker";

// Above this expansion zoom a cluster is a single marina whose boats never separate; list them instead.
const CLUSTER_EXPAND_MAX_ZOOM = 16;

// Zoom the map settles on when arriving from a listing's "See on map" deep link.
const DETAIL_FOCUS_ZOOM = 11;

// Breathing room the camera keeps around whatever it frames, so a marker on the outermost boat is
// inside the picture rather than balanced on its edge.
const MARKER_CLEARANCE = 80;

/*
 * How far the cluster fit is pulled back once the boats are framed.
 *
 * A fit puts the outermost of them exactly on that margin, which on a spread cluster reads as two
 * markers pinned to opposite edges — on screen, and easy to miss entirely. Half a zoom level shows
 * about a third more water each way, which is what makes the group read as a group.
 */
const CLUSTER_FIT_EASE = 0.5;

/*
 * How long the camera takes to open a cluster.
 *
 * Longer than mapbox's 500ms default because this flight is the biggest one the map makes — several
 * zoom levels at once — and at the default pace the boats have replaced the pill before the eye has
 * registered that anything moved.
 */
const CLUSTER_FLIGHT_MS = 800;

// The camera is written to the URL on every settle; this is the ceiling on how often that reaches
// the address bar while somebody is working the map.
const CAMERA_WRITE_MS = 500;

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
  /* The same URL state the list screen runs on, so filters survive a reload and travel with a link
     instead of dying with the component. */
  const { filters, setFilters, defaults } = useSearchFilters();
  const [camera, setCamera] = useQueryStates(mapCameraParsers, {
    limitUrlUpdates: throttle(CAMERA_WRITE_MS),
  });
  const [listOpen, setListOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(focusListingId);
  const [openCluster, setOpenCluster] = useState<OpenCluster | null>(null);
  const [map, setMap] = useState<MapInstance | null>(null);
  const [focusDone, setFocusDone] = useState(false);

  const shellRef = useRef<HTMLDivElement>(null);
  const filtersRef = useRef<HTMLFormElement>(null);
  const listRef = useRef<HTMLElement>(null);

  /* Read at construction and never again: the camera is written back as the visitor moves it, and
     feeding that return trip into the opening view would fight them for the wheel. */
  const openingView =
    camera.zoom != null && camera.centre
      ? { longitude: camera.centre.lng, latitude: camera.centre.lat, zoom: camera.zoom }
      : undefined;
  const openingViewRef = useRef(openingView);

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

  /*
   * The box the camera composes within: the container, less the panels lying over it and less a
   * margin all round.
   *
   * Held on the map itself rather than passed per call, because mapbox reads it into every camera
   * move — a cluster opening, a popup recentring, the opening view — and because `fitBounds` writes
   * whatever padding it was given back onto the map. Given the standing value it writes back the
   * same number; given a fresh sum it would grow the margins a little on every click.
   */
  useEffect(() => {
    const shell = shellRef.current;
    if (!map || !shell) return;

    /* Seeded from the map so a first pass that changes nothing does not jump the camera, which
       would put a `zoom` and a `centre` in the URL of a visitor who never touched the map. */
    let applied = paddingOf(map);

    const apply = () => {
      const box = shell.getBoundingClientRect();
      if (box.width === 0) return;

      const claimed = (panel: Element | null) => {
        if (!panel) return 0;
        const rect = panel.getBoundingClientRect();
        if (rect.width === 0) return 0;
        const right = rect.right - box.left;
        /* Only a panel hugging the left edge narrows the map sideways. A full-width sheet on a
           phone covers the bottom instead, which the popup answers with its own offset. */
        return right < box.width / 2 ? right : 0;
      };

      /* Kept well inside the container: mapbox abandons a fit whose padding leaves it no room,
         and a flat 80 a side very nearly does that on a phone. */
      const clearance = Math.min(MARKER_CLEARANCE, box.width / 6, box.height / 6);
      const next = {
        top: clearance,
        right: clearance,
        bottom: clearance,
        left: Math.max(claimed(filtersRef.current), claimed(listRef.current)) + clearance,
      };

      if (
        next.top === applied.top &&
        next.right === applied.right &&
        next.bottom === applied.bottom &&
        next.left === applied.left
      ) {
        return;
      }

      applied = next;
      map.setPadding(next);
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [map, listOpen]);

  // Written once the camera settles, so a reload — or a link sent to somebody — opens on the same
  // water. Replaced rather than pushed, or every nudge of the map is a step of the back button.
  useEffect(() => {
    if (!map) return;

    const write = () => {
      const centre = map.getCenter();
      void setCamera({
        zoom: Number(map.getZoom().toFixed(2)),
        centre: { lat: centre.lat, lng: centre.lng },
      });
    };

    map.on("moveend", write);
    return () => {
      map.off("moveend", write);
    };
  }, [map, setCamera]);

  function selectListing(listingId: string) {
    setOpenCluster(null);
    setSelectedListingId(listingId);
  }

  function dismissOverlays() {
    setSelectedListingId(null);
    setOpenCluster(null);
  }

  /*
   * Clicking a cluster frames the boats it actually holds — unless they sit on one marina (expansion
   * zoom past the cap) and can never separate, in which case they are listed in a popup instead of
   * the map flying into empty water.
   *
   * The boats decide the zoom, rather than a fixed step above the current one: a step overshoots a
   * tight cluster and undershoots a spread one, and neither lands with the group filling the screen.
   * Called from the marker's onClick (after touchend), so mapbox no longer cancels the flight.
   */
  function pressCluster(clusterId: number, lng: number, lat: number) {
    setSelectedListingId(null);
    const leaves = supercluster.getLeaves(clusterId, Infinity).map((leaf) => leaf.properties);
    const expansionZoom = supercluster.getClusterExpansionZoom(clusterId);

    if (map && expansionZoom <= CLUSTER_EXPAND_MAX_ZOOM) {
      setOpenCluster(null);

      /* Asked for rather than flown, so the zoom can be eased off before the camera commits. No
         padding of its own: without one mapbox falls back to the map's, which already describes the
         panels and the margin. */
      const bounds = boundsOf(leaves);
      const camera = map.cameraForBounds(bounds, { maxZoom: CLUSTER_EXPAND_MAX_ZOOM });

      if (camera?.zoom == null) {
        map.fitBounds(bounds, {
          maxZoom: CLUSTER_EXPAND_MAX_ZOOM,
          duration: CLUSTER_FLIGHT_MS,
        });
        return;
      }

      map.easeTo({
        ...camera,
        /* Never eased below the zoom that actually breaks the cluster apart, or backing off would
           land on the same pill the visitor just pressed. */
        zoom: Math.min(
          Math.max(camera.zoom - CLUSTER_FIT_EASE, expansionZoom),
          CLUSTER_EXPAND_MAX_ZOOM,
        ),
        duration: CLUSTER_FLIGHT_MS,
      });
      return;
    }

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
          initialViewState={openingViewRef.current}
          onReady={setMap}
          onBackgroundPress={dismissOverlays}
        >
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
              ref={filtersRef}
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
                ref={listRef}
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
