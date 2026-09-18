"use client";

import { useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { MapInstance } from "@/components/shared/map/map-canvas";
import MapMarker from "@/components/shared/map/map-marker";
import MapPopup from "@/components/shared/map/map-popup";
import RouteLine from "@/components/shared/map/route-line";
import {
  arrivalOf,
  ROUTE_DRAW_MS,
  routeCaption,
  routeCurve,
  routePoints,
} from "@/components/shared/map/route-points";
import { MarinaYachtsPopup } from "@/features/yachts";

import type { MapRoute, RouteMarina } from "../api/queries";
import { routeCatalogueHref } from "../lib/catalogue-href";
import { routeStart, toRouteStops } from "../lib/route-geometry";
import { DayMarker } from "./route-markers";

type StartGroup = { lat: number; lng: number; routes: MapRoute[] };

/*
 * Most routes start from a handful of charter hubs, so one pin per route would be a dozen pins on
 * one coordinate at Split. They are grouped by where they start, and a group opens a card to pick
 * from rather than guessing which one was meant.
 */
function groupByStart(routes: MapRoute[]): StartGroup[] {
  const groups = new Map<string, StartGroup>();
  for (const route of routes) {
    const start = routeStart(route);
    if (!start) continue;
    const key = `${start.lat},${start.lng}`;
    const group = groups.get(key);
    if (group) group.routes.push(route);
    else groups.set(key, { ...start, routes: [route] });
  }
  return [...groups.values()];
}

export interface RouteStartsLayerProps {
  /** Bumped by a press on the map itself, which closes whatever card is open. */
  dismissSignal: number;
  routes: MapRoute[];
  map: MapInstance | null;
  onSelect: (slug: string) => void;
}

export function RouteStartsLayer({ routes, map, onSelect, dismissSignal }: RouteStartsLayerProps) {
  const t = useTranslations("RoutesMap");
  const [open, setOpen] = useState<StartGroup | null>(null);
  useEffect(() => setOpen(null), [dismissSignal]);
  const groups = groupByStart(routes);

  return (
    <>
      {groups.map((group, index) => {
        const [first] = group.routes;
        if (!first) return null;
        const key = `${group.lat},${group.lng}`;
        return group.routes.length > 1 ? (
          <MapMarker
            key={key}
            variant="cluster"
            coordinates={group}
            count={group.routes.length}
            label={t("routesHere", { count: group.routes.length })}
            order={index}
            onSelect={() => setOpen(group)}
          />
        ) : (
          <MapMarker
            key={key}
            variant="pin"
            coordinates={group}
            label={first.title}
            order={index}
            onSelect={() => onSelect(first.slug)}
          />
        );
      })}

      {open ? (
        <MapPopup key={`${open.lat},${open.lng}`} coordinates={open} map={map} className="w-72">
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-2xl bg-card p-2 shadow-brand-glow">
            {open.routes.map((route) => (
              <button
                key={route.id}
                type="button"
                onClick={() => {
                  setOpen(null);
                  onSelect(route.slug);
                }}
                className="flex flex-col items-start gap-0.5 rounded-xl px-3 py-2 text-left outline-none transition-colors hover:bg-natural-50 focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="text-sm font-semibold text-foreground">{route.title}</span>
                <span className="text-xs text-natural-500">
                  {t("nights", { count: route.nights })}
                </span>
              </button>
            ))}
          </div>
        </MapPopup>
      ) : null}
    </>
  );
}

export interface SelectedRouteLayerProps {
  /** Bumped by a press on the map itself, which closes whatever card is open. */
  dismissSignal: number;
  route: MapRoute;
  marinas: RouteMarina[];
  map: MapInstance | null;
  /** The marina whose boats are open, held by the screen so it can clear the way for the card. */
  openMarina: RouteMarina | null;
  onOpenMarina: (marina: RouteMarina | null) => void;
}

export function SelectedRouteLayer({
  route,
  marinas,
  map,
  dismissSignal,
  openMarina,
  onOpenMarina,
}: SelectedRouteLayerProps) {
  const t = useTranslations("RoutesMap");
  const words = useTranslations("YachtDetail.route");
  const reduced = useReducedMotion();
  useEffect(() => onOpenMarina(null), [dismissSignal, onOpenMarina]);

  const stops = toRouteStops(route);
  const points = routePoints(stops);
  const curve = routeCurve(stops);
  const captions = {
    start: words("start"),
    finish: words("finish"),
    day: (day: number) => words("day", { day }),
  };

  return (
    <>
      {/* Under the days, so the start's number and its "Start" plate stay readable over the
          marinas that crowd a charter base. */}
      {/* The search map's own marker, so a marina reads the same on both maps: a count pill where
          it holds several boats, a bare pin for one. */}
      {marinas.map((marina, index) => {
        const label = t("marinaYachts", { name: marina.name, count: marina.listingCount });
        return marina.listingCount > 1 ? (
          <MapMarker
            key={marina.value}
            variant="cluster"
            coordinates={marina}
            count={marina.listingCount}
            label={label}
            order={index}
            onSelect={() => onOpenMarina(marina)}
          />
        ) : (
          <MapMarker
            key={marina.value}
            variant="pin"
            coordinates={marina}
            label={label}
            selected={openMarina?.value === marina.value}
            order={index}
            onSelect={() => onOpenMarina(marina)}
          />
        );
      })}

      <RouteLine key={route.id} curve={curve} animate={!reduced} />

      {points.map((point) => {
        const [day = 1] = point.days;
        const caption = routeCaption(point, stops, captions);
        return (
          <DayMarker
            key={`${route.id}-${point.lat},${point.lng}`}
            coordinates={point}
            day={day}
            label={point.stops.map((stop) => stop.title).join(", ")}
            /* Only the ends are named: the dot already carries the day's number. */
            caption={caption === captions.day(day) ? undefined : caption}
            delayMs={reduced ? 0 : arrivalOf(curve, point) * ROUTE_DRAW_MS}
            onSelect={() => onOpenMarina(null)}
          />
        );
      })}

      {openMarina ? (
        <MarinaYachtsPopup
          key={openMarina.value}
          coordinates={openMarina}
          marinas={openMarina.values}
          filters={{
            country: route.countryValue ? [route.countryValue] : [],
            duration: String(route.nights),
          }}
          map={map}
          catalogueHref={routeCatalogueHref(route, openMarina)}
        />
      ) : null}
    </>
  );
}
