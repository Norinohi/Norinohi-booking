"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useEffect, useRef, useState } from "react";

import { boundsOf, type Coordinates } from "@/components/shared/map/geometry";
import type { MapInstance } from "@/components/shared/map/map-canvas";
import { useRouter } from "@/i18n/navigation";

import { routeMarinasQueryOptions, routesMapQueryOptions } from "../api/queries";
import { matchesFilters, type RouteFilters } from "../lib/route-filters";
import { routeStart } from "../lib/route-geometry";
import { routesMapParsers, serializeRoutesMap } from "../lib/search-params";
import { RouteStartsLayer, SelectedRouteLayer } from "./routes-map-layers";
import RoutesPanel from "./routes-panel";

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
  const select = (next: string | null) =>
    router.push(serializeRoutesMap(next ? `/routes/${next}` : "/routes", state), { scroll: false });
  const focus = (point: Coordinates) => {
    if (!map) return;
    map.easeTo({
      center: [point.lng, point.lat],
      zoom: Math.max(map.getZoom(), FOCUS_ZOOM),
      padding: freeArea(map, panelRef.current),
    });
  };

  return (
    <div className="relative h-[calc(100dvh-var(--header-h))] min-h-0">
      <MapCanvas
        pathDepth={2}
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

      <RoutesPanel
        ref={panelRef}
        routes={routes}
        visible={visible}
        selected={selected}
        filters={filters}
        onFiltersChange={(next) => void setState(next)}
        onResetFilters={() => void setState({ q: null, country: null, length: null, level: null })}
        onSelect={select}
        onFocus={focus}
        marinas={marinas}
        marinasPending={Boolean(selected) && marinasQuery.isPending}
        marinasFailed={marinasQuery.isError}
        className="absolute inset-x-3 bottom-3 max-h-[55%] md:inset-x-auto md:top-6 md:bottom-6 md:left-6 md:max-h-none md:w-100 2xl:top-8 2xl:bottom-8 2xl:left-8"
      />
    </div>
  );
}
