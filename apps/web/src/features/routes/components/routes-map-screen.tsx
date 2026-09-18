"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useLocale } from "next-intl";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useEffect, useRef, useState } from "react";

import { boundsOf, type Coordinates } from "@/components/shared/map/geometry";
import type { MapInstance } from "@/components/shared/map/map-canvas";
import { useRouter } from "@/i18n/navigation";

import { type RouteMarina, routeMarinasQueryOptions, routesMapQueryOptions } from "../api/queries";
import { matchesFilters, type RouteFilters } from "../lib/route-filters";
import { routeStart } from "../lib/route-geometry";
import { routesMapParsers, serializeRoutesMap } from "../lib/search-params";
import { RouteStartsLayer, SelectedRouteLayer } from "./routes-map-layers";
import RoutesMapChrome from "./routes-map-chrome";
import RoutesPanel, { RouteFiltersCard } from "./routes-panel";

const MapCanvas = dynamic(() => import("@/components/shared/map/map-canvas"), {
  ssr: false,
  loading: () => <div className="size-full bg-natural-50" />,
});

const EDGE = 48;
const FIT_MAX_ZOOM = 11;
const FOCUS_ZOOM = 12;

type Padding = { top: number; right: number; bottom: number; left: number };

/*
 * The panel floats over the map, so what is framed has to land in the part it leaves free. It is
 * measured at the moment of framing rather than per breakpoint: beside the map on a wide screen,
 * below it on a phone, and whichever it is the side it covers gets its size added.
 */
function freeArea(map: MapInstance, panel: HTMLElement | null): Padding {
  const padding = { top: EDGE, right: EDGE, bottom: EDGE, left: EDGE };
  if (!panel) return padding;

  const box = map.getContainer().getBoundingClientRect();
  const card = panel.getBoundingClientRect();
  if (card.width < box.width / 2) padding.left += card.right - box.left;
  else padding.bottom += box.bottom - card.top;
  return padding;
}

/* One point is a zoom, not a box: `fitBounds` over a zero-size box lands at the maximum zoom. */
function frame(map: MapInstance, points: Coordinates[], padding: Padding) {
  const [only] = points;
  if (!only) return;
  if (points.length === 1) {
    map.easeTo({ center: [only.lng, only.lat], zoom: 10, padding });
    return;
  }
  map.fitBounds(boundsOf(points), { padding, maxZoom: FIT_MAX_ZOOM });
}

export default function RoutesMapScreen() {
  const locale = useLocale();
  const [state, setState] = useQueryStates(routesMapParsers, { history: "replace" });
  const { slug } = useParams<{ slug?: string }>();
  const router = useRouter();
  const [map, setMap] = useState<MapInstance | null>(null);
  const [dismissSignal, setDismissSignal] = useState(0);
  const [openMarina, setOpenMarina] = useState<RouteMarina | null>(null);
  /* Phones only. The list waits behind its button, as on the yachts map; an open route shows at
     once and folds per route, so opening another one unfolds it. */
  const [listOpen, setListOpen] = useState(false);
  const [fold, setFold] = useState({ key: "", collapsed: false });
  const panelRef = useRef<HTMLElement>(null);

  const { data } = useQuery(routesMapQueryOptions(locale));
  const routes = data?.routes ?? [];
  const filters: RouteFilters = {
    q: state.q,
    country: state.country,
    length: state.length,
    level: state.level,
  };
  const visible = routes.filter((route) => matchesFilters(route, filters));
  /* A link to a route stays open whatever the filters say: it was asked for by name. */
  const selected = routes.find((route) => route.slug === slug) ?? null;

  const marinasQuery = useQuery({
    ...routeMarinasQueryOptions(selected?.id ?? ""),
    enabled: Boolean(selected),
  });
  const marinas = selected ? (marinasQuery.data?.marinas ?? []) : [];

  /*
   * The camera follows what is on the panel: the open route and its marinas, or every route the
   * filters leave. Keyed on ids rather than on the arrays, which are new on every render.
   */
  const framedKey = selected
    ? `${selected.id}:${marinas.map((marina) => marina.value).join()}`
    : visible.map((route) => route.id).join();
  useEffect(() => {
    if (!map) return;
    const points: Coordinates[] = selected
      ? [...selected.stops, ...marinas]
      : visible.flatMap((route) => routeStart(route) ?? []);
    frame(map, points, freeArea(map, panelRef.current));
  }, [map, framedKey]);

  /* A navigation, not a query change: each route is its own page with its own metadata. The
     layout keeps the map, and the filters travel along so "All routes" returns to the same list. */
  const resetFilters = () => void setState({ q: null, country: null, length: null, level: null });
  const select = (next: string | null) =>
    router.push(serializeRoutesMap(next ? `/routes/${next}` : "/routes", state), { scroll: false });
  const collapsed = selected ? fold.key === selected.id && fold.collapsed : !listOpen;
  const setCollapsed = (next: boolean) =>
    selected ? setFold({ key: selected.id, collapsed: next }) : setListOpen(!next);

  const focus = (point: Coordinates) => {
    if (!map) return;
    map.easeTo({
      center: [point.lng, point.lat],
      zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
      padding: freeArea(map, panelRef.current),
    });
  };

  return (
    /* Full height on a phone, where the site header steps aside for the map as on /yachts/map. */
    <div className="relative h-dvh min-h-0 md:h-[calc(100dvh-var(--header-h))]">
      <MapCanvas
        pathDepth={2}
        locateControl
        dimOpacity={0}
        onReady={setMap}
        onBackgroundPress={() => setDismissSignal((signal) => signal + 1)}
      >
        {selected ? (
          <SelectedRouteLayer
            key={selected.id}
            route={selected}
            marinas={marinas}
            map={map}
            dismissSignal={dismissSignal}
            openMarina={openMarina}
            onOpenMarina={setOpenMarina}
          />
        ) : (
          <RouteStartsLayer
            routes={visible}
            map={map}
            onSelect={select}
            dismissSignal={dismissSignal}
          />
        )}
      </MapCanvas>

      {/* The cards the map's left edge belongs to, laid out as the yachts map lays its own. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-3 bottom-3 flex max-h-[55%] items-start gap-5 md:inset-x-auto md:top-6 md:bottom-6 md:left-6 md:max-h-none 2xl:top-8 2xl:bottom-8 2xl:left-8",
          /* A marina's boats open over the map, and on a phone the panel would sit on top of them,
             as the search map's chrome would; it steps aside until the card is closed. */
          (openMarina || (!selected && !listOpen)) && "max-md:hidden",
        )}
      >
        <RouteFiltersCard
          routes={routes}
          filters={filters}
          onChange={(next) => void setState(next)}
          onReset={resetFilters}
          className="pointer-events-auto hidden max-h-full w-83.5 shrink-0 xl:flex"
        />
        <RoutesPanel
          ref={panelRef}
          routes={routes}
          visible={visible}
          selected={selected}
          filters={filters}
          onFiltersChange={(next) => void setState(next)}
          onResetFilters={resetFilters}
          onSelect={select}
          onFocus={focus}
          marinas={marinas}
          marinasPending={Boolean(selected) && marinasQuery.isPending}
          marinasFailed={marinasQuery.isError}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          className="pointer-events-auto max-h-[50dvh] w-full md:h-full md:max-h-full md:w-100"
        />
      </div>

      <RoutesMapChrome
        routes={routes}
        visibleCount={visible.length}
        filters={filters}
        onFiltersChange={(next) => void setState(next)}
        onResetFilters={resetFilters}
        listOpen={!selected && listOpen}
        onListOpenChange={(open) => {
          if (selected && open) select(null);
          setListOpen(open);
        }}
        popupOpen={Boolean(openMarina)}
      />
    </div>
  );
}
