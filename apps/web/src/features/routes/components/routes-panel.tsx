"use client";

import { Button, buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { Select } from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { ScrollArea } from "@yacht-charter/ui/components/layout/scroll-area";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Activity, ArrowLeft, ChevronRight, Clock, MapPin, Search, Ship } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Ref } from "react";

import DayTimeline from "@/components/shared/data-display/day-timeline";
import { Image } from "@/components/shared/data-display/image";
import type { Coordinates } from "@/components/shared/map/geometry";
import { Link } from "@/i18n/navigation";

import type { MapRoute, RouteMarina } from "../api/queries";
import { routeCatalogueHref } from "../lib/catalogue-href";
import { routeImage } from "@/utils/route-image";
import {
  countryOptions,
  ROUTE_LENGTHS,
  ROUTE_LEVELS,
  type RouteFilters,
  type RouteLength,
  type RouteLevel,
} from "../lib/route-filters";

/* The same pressable surface everywhere in the panel, so every row reads as something to press. */
const ROW =
  "rounded-xl border border-border bg-card outline-none transition-colors hover:border-brand/40 hover:bg-brand-50/40 focus-visible:ring-2 focus-visible:ring-ring/40";

function RouteChips({ route }: { route: MapRoute }) {
  const t = useTranslations("RoutesMap");
  const levels = useTranslations("Home.SailingRoutes.levels");

  return (
    <span className="flex flex-wrap gap-1.5">
      <Chip variant="neutral">
        <Clock />
        {t("nights", { count: route.nights })}
      </Chip>
      {route.difficulty ? (
        <Chip variant="neutral">
          <Activity />
          {levels(route.difficulty)}
        </Chip>
      ) : null}
    </span>
  );
}

function RouteThumb({ route, className }: { route: MapRoute; className?: string }) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden bg-natural-100", className)}>
      <Image src={routeImage(route)} alt="" fill sizes="400px" className="object-cover" />
    </span>
  );
}

function RouteFiltersForm({
  routes,
  filters,
  onChange,
}: {
  routes: MapRoute[];
  filters: RouteFilters;
  onChange: (next: Partial<RouteFilters>) => void;
}) {
  const t = useTranslations("RoutesMap");
  const levels = useTranslations("Home.SailingRoutes.levels");
  const common = useTranslations("Common");

  return (
    <div className="flex flex-col gap-2">
      <TextField
        type="search"
        value={filters.q}
        onChange={(event) => onChange({ q: event.target.value })}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        startIcon={<Search />}
        fieldClassName="h-11"
      />
      <div className="min-w-0">
        <Select
          className="h-11 w-full min-w-0 bg-card"
          ariaLabel={t("country")}
          placeholder={t("country")}
          options={countryOptions(routes)}
          value={filters.country}
          onValueChange={(country) => onChange({ country })}
          clearable={filters.country !== null}
          onClear={() => onChange({ country: null })}
          clearLabel={common("removeFilter", { label: t("country") })}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0">
          <Select
            className="h-11 w-full min-w-0 bg-card"
            ariaLabel={t("length")}
            placeholder={t("length")}
            options={ROUTE_LENGTHS.map((value) => ({ value, label: t(`lengths.${value}`) }))}
            value={filters.length}
            /* SAFETY: every option above is built from ROUTE_LENGTHS. */
            onValueChange={(length) => onChange({ length: length as RouteLength })}
            clearable={filters.length !== null}
            onClear={() => onChange({ length: null })}
            clearLabel={common("removeFilter", { label: t("length") })}
          />
        </div>
        <div className="min-w-0">
          <Select
            className="h-11 w-full min-w-0 bg-card"
            ariaLabel={t("level")}
            placeholder={t("level")}
            options={ROUTE_LEVELS.map((value) => ({ value, label: levels(value) }))}
            value={filters.level}
            /* SAFETY: every option above is built from ROUTE_LEVELS. */
            onValueChange={(level) => onChange({ level: level as RouteLevel })}
            clearable={filters.level !== null}
            onClear={() => onChange({ level: null })}
            clearLabel={common("removeFilter", { label: t("level") })}
          />
        </div>
      </div>
    </div>
  );
}

function RouteList({
  routes,
  onSelect,
  onReset,
}: {
  routes: MapRoute[];
  onSelect: (slug: string) => void;
  onReset: () => void;
}) {
  const t = useTranslations("RoutesMap");

  if (!routes.length) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl bg-natural-50 p-6 text-center">
        <p className="text-sm text-natural-500">{t("noResults")}</p>
        <Button type="button" variant="neutral" size="sm" onClick={onReset}>
          {t("resetFilters")}
        </Button>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {routes.map((route) => (
        <li key={route.id}>
          <button
            type="button"
            onClick={() => onSelect(route.slug)}
            className={cn(ROW, "group flex w-full items-stretch gap-3 p-2 text-left")}
          >
            <RouteThumb route={route} className="w-20 rounded-lg" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
              <span className="truncate text-sm font-semibold text-foreground">{route.title}</span>
              <span className="truncate text-xs text-natural-500">{route.placeLabel}</span>
              <RouteChips route={route} />
            </span>
            <ChevronRight className="size-4 shrink-0 self-center text-natural-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function Itinerary({ route, onFocus }: { route: MapRoute; onFocus: (point: Coordinates) => void }) {
  const t = useTranslations("RoutesMap");
  const days = route.stops.map((stop) => ({ title: stop.name, text: stop.note }));

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">{t("itinerary")}</h3>
      {/* Keyed on the route, so opening another one plays its days from the start. */}
      <DayTimeline
        key={route.id}
        compact
        columns={[days]}
        onSelect={(index) => {
          const stop = route.stops[index];
          if (stop) onFocus(stop);
        }}
      />
    </section>
  );
}

function NearbyMarinas({
  route,
  marinas,
  pending,
  failed,
  onFocus,
}: {
  route: MapRoute;
  marinas: RouteMarina[];
  pending: boolean;
  failed: boolean;
  onFocus: (point: Coordinates) => void;
}) {
  const t = useTranslations("RoutesMap");
  const note = pending ? t("loadingMarinas") : failed ? t("marinasFailed") : t("noMarinas");

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-foreground">{t("nearbyMarinas")}</h3>
      {pending || failed || marinas.length === 0 ? (
        <p className="rounded-xl bg-natural-50 p-4 text-sm text-natural-500">{note}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {marinas.map((marina) => (
            <li key={marina.value} className={cn(ROW, "flex items-center gap-2 p-2 pl-3")}>
              <button
                type="button"
                onClick={() => onFocus(marina)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <MapPin className="size-4 shrink-0 text-brand" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {marina.name}
                  </span>
                  <span className="text-xs text-natural-500">
                    {t("marinaDistance", {
                      km: Math.max(1, Math.round(marina.distanceKm)),
                      stop: marina.nearStop,
                    })}
                  </span>
                </span>
              </button>
              <Link
                href={routeCatalogueHref(route, marina)}
                target="_blank"
                rel="noopener"
                aria-label={t("marinaYachts", { name: marina.name, count: marina.listingCount })}
                className={buttonVariants({
                  variant: "neutral",
                  size: "sm",
                  className: "shrink-0 gap-1.5",
                })}
              >
                <Ship />
                {marina.listingCount}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export interface RoutesPanelProps {
  routes: MapRoute[];
  visible: MapRoute[];
  selected: MapRoute | null;
  filters: RouteFilters;
  onFiltersChange: (next: Partial<RouteFilters>) => void;
  onResetFilters: () => void;
  onSelect: (slug: string | null) => void;
  /** Moves the map to a day of the itinerary or a marina picked from the panel. */
  onFocus: (point: Coordinates) => void;
  marinas: RouteMarina[];
  marinasPending: boolean;
  marinasFailed: boolean;
  ref?: Ref<HTMLElement>;
  className?: string;
}

/**
 * A card floating over the map, shaped like the search map's filter panel: a fixed header, a body
 * that scrolls on its own, and for an open route the way to its boats pinned to the bottom.
 */
export default function RoutesPanel({
  routes,
  visible,
  selected,
  filters,
  onFiltersChange,
  onResetFilters,
  onSelect,
  onFocus,
  marinas,
  marinasPending,
  marinasFailed,
  ref,
  className,
}: RoutesPanelProps) {
  const t = useTranslations("RoutesMap");

  return (
    <aside
      ref={ref}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card",
        className,
      )}
    >
      {selected ? (
        <>
          <div className="relative shrink-0">
            <RouteThumb route={selected} className="h-28 w-full md:h-36" />
            <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent" />
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-card/95 px-3 py-1.5 text-sm font-medium text-foreground shadow-card outline-none transition-colors hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <ArrowLeft className="size-4" />
              {t("allRoutes")}
            </button>
            <div className="absolute inset-x-4 bottom-3 flex flex-col gap-0.5 text-white">
              <h2 className="text-xl leading-6 font-bold">{selected.title}</h2>
              <p className="truncate text-xs text-white/80">{selected.placeLabel}</p>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            <div className="flex flex-col gap-5 p-4">
              <RouteChips route={selected} />
              {selected.description ? (
                <p className="text-sm leading-5 text-natural-600">{selected.description}</p>
              ) : null}
              {selected.stops.length ? <Itinerary route={selected} onFocus={onFocus} /> : null}
              <NearbyMarinas
                route={selected}
                marinas={marinas}
                pending={marinasPending}
                failed={marinasFailed}
                onFocus={onFocus}
              />
            </div>
          </ScrollArea>

          <div className="shrink-0 border-t border-border p-4">
            <Link
              href={routeCatalogueHref(selected)}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: "brand", size: "md", className: "w-full" })}
            >
              {t("showRouteYachts")}
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="flex shrink-0 flex-col gap-3 border-b border-border p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl leading-[1.3] font-bold text-natural-700">{t("title")}</h2>
              <span className="text-sm text-natural-500">
                {t("count", { count: visible.length, total: routes.length })}
              </span>
            </div>
            <RouteFiltersForm routes={routes} filters={filters} onChange={onFiltersChange} />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-3">
              <RouteList routes={visible} onSelect={onSelect} onReset={onResetFilters} />
            </div>
          </ScrollArea>
        </>
      )}
    </aside>
  );
}
