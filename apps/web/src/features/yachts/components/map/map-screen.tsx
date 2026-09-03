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

/*
 * How long a descent takes, per zoom level it has to cross.
 *
 * A fixed number cannot serve it. The 800ms that reads as deliberate over the two or three levels a
 * splitting cluster moves is a snap over the six or seven between a coastline view and a berth, and
 * the duration that suits the six drags over the two. Matching the rate instead — near enough the
 * rate the splitting flight runs at — keeps every camera move on this screen feeling like the same
 * hand, whatever zoom it started from.
 */
const DESCENT_MS_PER_ZOOM = 210;

/* Bounds on it: a press from almost on top of a marina should still move rather than cut, and a
   descent from the far end of the range should not become a tour. Mapbox's own pacing, which is
   what this replaced, ran past four seconds on the longest of them. */
const DESCENT_MIN_MS = 400;
const DESCENT_MAX_MS = 1600;

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

/*
 * How long the map takes to give up the width a panel has just claimed, or to take it back.
 *
 * `setPadding` moves the camera the instant it is called, so opening the list made the map flinch
 * sideways by half the panel. Close to the 200ms the chrome around it fades in, so the two read as
 * one movement rather than a panel arriving and the map reacting to it.
 */
const PANEL_SHIFT_MS = 250;

/**
 * The descent to a place the visitor has named: as close as the map goes, timed by how far it has to
 * come.
 *
 * Nothing when the camera is already there, which is the ordinary case for "See on map" now that the
 * link carries its own camera — there is no flight to make, only the card to slide in.
 */
function descentTo(map: MapInstance): { focusZoom: number; focusDurationMs: number } | null {
  const berth = map.getMaxZoom();
  const levels = berth - map.getZoom();
  if (levels <= 0) return null;

  return {
    focusZoom: berth,
    focusDurationMs: Math.min(
      Math.max(levels * DESCENT_MS_PER_ZOOM, DESCENT_MIN_MS),
      DESCENT_MAX_MS,
    ),
  };
}

type OpenCluster = {
  lng: number;
  lat: number;
  leaves: MapMarkerData[];
  /** Set where the camera still has to come down to the marina; the popup's own opening does it. */
  focusZoom?: number;
  /** Paired with it: how long that descent runs, scaled to how far it has to come. */
  focusDurationMs?: number;
};

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
  /* False until the map has been given its first padding, which is the one that must not animate:
     the visitor has not opened anything yet, they are just arriving. */
  const panelsSettled = useRef(false);

  /*
   * Where a newly built map opens, read live from the URL rather than frozen at first render.
   *
   * `initialViewState` is consumed once, when mapbox is constructed, and ignored for the rest of
   * that map's life — so handing it the current value costs nothing while the visitor is driving.
   * Freezing it did cost something: Next keeps this route mounted after a visit (Activity), and the
   * map is torn down and rebuilt on the way back, so a frozen value reopened the view somebody left
   * days ago. Following "See on map" landed on that stale water and then flew to the boat from it.
   */
  const openingView =
    camera.zoom != null && camera.centre
      ? { longitude: camera.centre.lng, latitude: camera.centre.lat, zoom: camera.zoom }
      : undefined;

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

    const apply = (animate: boolean) => {
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

      /* Eased where a panel opened or closed, because that is a movement the visitor caused and
         should be able to follow. Jumped on the first pass and on a resize, where the map is
         already being rebuilt around them and an animation would only lag behind the drag. */
      if (animate) map.easeTo({ padding: next, duration: PANEL_SHIFT_MS });
      else map.setPadding(next);
    };

    apply(panelsSettled.current);
    panelsSettled.current = true;

    const observer = new ResizeObserver(() => apply(false));
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
   * Clicking a cluster frames the boats it actually holds.
   *
   * The boats decide the zoom, rather than a fixed step above the current one: a step overshoots a
   * tight cluster and undershoots a spread one, and neither lands with the group filling the screen.
   * Called from the marker's onClick (after touchend), so mapbox no longer cancels the flight.
   *
   * Past the expansion cap the boats share one marina and no zoom separates them, so the popup
   * lists them instead. The camera still goes all the way down to that marina: the popup alone
   * answered *what* is here and left the visitor at the zoom they pressed from, none the wiser
   * about *where*. It rides the popup's own opening rather than being flown separately, or the two
   * fight for the camera and the card ends up somewhere the visitor is not looking.
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

    const opened: OpenCluster = { lng, lat, leaves };

    const descent = map ? descentTo(map) : null;
    if (descent) {
      opened.focusZoom = descent.focusZoom;
      opened.focusDurationMs = descent.focusDurationMs;
    }

    setOpenCluster(opened);
  }

  /*
   * What is open on the map follows the URL, re-read every time a map is built.
   *
   * Next keeps this route mounted once it has been visited (Activity), so the `useState` initialisers
   * above do not run again on the way back — and an effect watching only the parameter does not fire
   * either, because a parameter that is absent both times has not changed. A card opened on one visit
   * therefore came back on the next, hanging over a URL that named no boat at all.
   *
   * The map instance is the honest signal for "this is a new visit": it is torn down on the way out
   * and rebuilt on the way in, exactly once each. Its children only render once that new map is idle,
   * which is after this has run, so the stale card never gets a frame to appear in.
   */
  useEffect(() => {
    if (!map) return;
    setSelectedListingId(focusListingId);
    setOpenCluster(null);
    setFocusDone(false);
  }, [map, focusListingId]);

  /*
   * Deep link from a listing's "See on map": the target boat's popup opens (selectedListingId is
   * seeded from the URL) and, the first time it does, its open animation also zooms in — one motion,
   * instead of a flyTo that the popup's own recenter would immediately override. Consumed once so a
   * later tap on the same boat doesn't yank the zoom back out.
   *
   * The button that sends visitors here now writes the camera into the link, so ordinarily the map
   * has already opened on the boat and `descentTo` finds nothing left to do. This is what covers the
   * rest: a `?selected=` URL that was bookmarked or passed on before the camera rode along.
   *
   * Spent by the card once it has actually ordered the flight, not by an effect watching this value.
   * The card opens only after the map has settled, and the markers can arrive before that — so a
   * flag cleared on render was routinely cleared first, and the deep link then merely panned.
   */
  const detailDescent =
    map && !focusDone && focusListingId && selected?.listingId === focusListingId
      ? descentTo(map)
      : null;

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
          initialViewState={openingView}
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
              focusZoom={detailDescent?.focusZoom}
              focusDurationMs={detailDescent?.focusDurationMs}
              onFocusApplied={() => setFocusDone(true)}
            />
          ) : openCluster ? (
            <MapBoatPopup
              key={openCluster.leaves[0]?.listingId}
              coordinates={{ lat: openCluster.lat, lng: openCluster.lng }}
              boats={openCluster.leaves.map((leaf) => toMapCard(leaf.listing))}
              map={map}
              focusZoom={openCluster.focusZoom}
              focusDurationMs={openCluster.focusDurationMs}
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
