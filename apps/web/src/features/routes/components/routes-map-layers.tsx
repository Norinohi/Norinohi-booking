"use client";

import { buttonVariants } from "@yacht-charter/ui/components/actions/button";
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
import { Link } from "@/i18n/navigation";

import type { MapRoute, RouteMarina } from "../api/queries";
import { routeCatalogueHref } from "../lib/catalogue-href";
import { routeStart, toRouteStops } from "../lib/route-geometry";
import { DayMarker, MarinaMarker } from "./route-markers";

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
}

export function SelectedRouteLayer({
  route,
  marinas,
  map,
  dismissSignal,
}: SelectedRouteLayerProps) {
  const t = useTranslations("RoutesMap");
  const words = useTranslations("YachtDetail.route");
  const reduced = useReducedMotion();
  const [openMarina, setOpenMarina] = useState<RouteMarina | null>(null);
  useEffect(() => setOpenMarina(null), [dismissSignal]);

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
      {marinas.map((marina, index) => (
        <MarinaMarker
          key={marina.value}
          coordinates={marina}
          count={marina.listingCount}
          label={t("marinaYachts", { name: marina.name, count: marina.listingCount })}
          selected={openMarina?.value === marina.value}
          order={index}
          onSelect={() => setOpenMarina(marina)}
        />
      ))}

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
            onSelect={() => setOpenMarina(null)}
          />
        );
      })}

      {openMarina ? (
        <MapPopup key={openMarina.value} coordinates={openMarina} map={map} className="w-72">
          <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-brand-glow">
            <div className="flex flex-col gap-1">
              <p className="text-base leading-5.5 font-bold text-foreground">{openMarina.name}</p>
              <p className="text-sm text-natural-500">
                {t("marinaMeta", {
                  count: openMarina.listingCount,
                  km: Math.max(1, Math.round(openMarina.distanceKm)),
                })}
              </p>
            </div>
            <Link
              href={routeCatalogueHref(route, openMarina)}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: "primary", size: "sm" })}
            >
              {t("showMarinaYachts")}
            </Link>
          </div>
        </MapPopup>
      ) : null}
    </>
  );
}
