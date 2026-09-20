"use client";

import { Button, buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { Select } from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { ScrollArea } from "@yacht-charter/ui/components/layout/scroll-area";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { cn } from "@yacht-charter/ui/lib/utils";
import {
  Activity,
  ArrowLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Map as MapIcon,
  MapPin,
  Search,
  Ship,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, type Ref, useState } from "react";

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

/* Ten fit a laptop's panel without the page scrolling past the pager. */
const ROUTES_PAGE_SIZE = 10;

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

/* A field's name above it, where the filters have a card of their own and room to say so. */
function Labelled({
  label,
  show,
  children,
}: {
  label: string;
  show: boolean;
  children: ReactNode;
}) {
  if (!show) return children;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm leading-4.25 font-semibold text-foreground">{label}</span>
      {children}
    </div>
  );
}

function RouteFiltersForm({
  routes,
  filters,
  onChange,
  labelled = false,
}: {
  routes: MapRoute[];
  filters: RouteFilters;
  onChange: (next: Partial<RouteFilters>) => void;
  labelled?: boolean;
}) {
  const t = useTranslations("RoutesMap");
  const levels = useTranslations("Home.SailingRoutes.levels");
  const common = useTranslations("Common");

  return (
    <div className={cn("flex flex-col", labelled ? "gap-4" : "gap-2")}>
      <TextField
        label={labelled ? t("search") : undefined}
        type="search"
        value={filters.q}
        onChange={(event) => onChange({ q: event.target.value })}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchPlaceholder")}
        startIcon={<Search />}
        fieldClassName="h-11"
      />
      <Labelled label={t("country")} show={labelled}>
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
      </Labelled>
      <div className={cn("grid grid-cols-2", labelled ? "gap-4" : "gap-2")}>
        <Labelled label={t("length")} show={labelled}>
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
        </Labelled>
        <Labelled label={t("level")} show={labelled}>
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
        </Labelled>
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
        numbered
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
  onResetFilters: () => void;
  onSelect: (slug: string | null) => void;
  /** Moves the map to a day of the itinerary or a marina picked from the panel. */
  onFocus: (point: Coordinates) => void;
  marinas: RouteMarina[];
  marinasPending: boolean;
  marinasFailed: boolean;
  /** Phones only: folded down to its bar. Held by the screen, whose list button opens it too. */
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** Puts the whole list away, from md up where it has no fold bar. */
  onClose?: () => void;
  /** Frames the open route on the map, and on a phone puts the card away to show it. */
  onShowOnMap?: () => void;
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
  onResetFilters,
  onSelect,
  onFocus,
  marinas,
  marinasPending,
  marinasFailed,
  collapsed,
  onCollapsedChange,
  onClose,
  onShowOnMap,
  ref,
  className,
}: RoutesPanelProps) {
  const t = useTranslations("RoutesMap");
  /* Paged over whatever the filters leave, and back to the first page when that changes: page 3
     of a list the visitor has just narrowed to eight routes would be empty. */
  const listKey = visible.map((route) => route.id).join();
  const [paging, setPaging] = useState({ key: listKey, page: 1 });
  const page = paging.key === listKey ? paging.page : 1;

  return (
    <aside
      ref={ref}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card",
        className,
      )}
    >
      {/* Phones only, for an open route. Open, the card fills the screen and its header carries a
          close; closed, it is one button that says what pressing it brings back, so the way to the
          map and the way back are both plain. */}
      {selected ? (
        collapsed ? (
          <button
            type="button"
            aria-expanded={false}
            onClick={() => onCollapsedChange(false)}
            className="flex shrink-0 items-center gap-2 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:hidden"
          >
            <ChevronUp className="size-5 shrink-0 text-brand" />
            <span className="min-w-0 flex-1 truncate text-base font-bold text-natural-700">
              {t("showDetails")}
            </span>
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-3 border-b border-border py-2 pr-2 pl-4 md:hidden">
            <span className="min-w-0 flex-1 truncate text-base font-bold text-natural-700">
              {selected.title}
            </span>
            <IconButton
              variant="subtle"
              size="sm"
              aria-label={t("closeDetails")}
              onClick={() => onCollapsedChange(true)}
            >
              <X />
            </IconButton>
          </div>
        )
      ) : null}

      <div className={cn("flex min-h-0 flex-1 flex-col", selected && collapsed && "max-md:hidden")}>
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
              {/* Puts the card away without closing the route, which stays drawn on the map. */}
              {onClose ? (
                <IconButton
                  variant="neutral"
                  size="sm"
                  aria-label={t("hidePanel")}
                  onClick={onClose}
                  className="absolute top-3 right-3 max-md:hidden"
                >
                  <X />
                </IconButton>
              ) : null}
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

            <div className="flex shrink-0 gap-2 border-t border-border p-4">
              <Link
                href={routeCatalogueHref(selected)}
                target="_blank"
                rel="noopener"
                className={buttonVariants({
                  variant: "brand",
                  size: "md",
                  /* Truncating rather than wrapping: the row is one line, and a name long in one
                     language must not push the map button off the card. */
                  className: "min-w-0 flex-1 truncate",
                })}
              >
                {t("showRouteYachts")}
              </Link>
              {/* The other half of the page: the card covers the map on a phone, so this puts it
                  away and frames the route. */}
              {onShowOnMap ? (
                <Button
                  type="button"
                  variant="neutral"
                  size="md"
                  onClick={onShowOnMap}
                  className="w-auto shrink-0"
                >
                  <MapIcon />
                  <span className="sr-only md:not-sr-only">{t("showOnMap")}</span>
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="flex shrink-0 flex-col gap-3 border-b border-border p-4">
              {/* The fold bar above names the list on a phone; the count still matters there. */}
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-xl leading-[1.3] font-bold text-natural-700 max-md:hidden">
                  {t("title")}
                </h2>
                <span className="text-sm text-natural-500">
                  {t("count", { count: visible.length, total: routes.length })}
                </span>
                {/* From md the panel is put away from here; on a phone the button over the map
                    does it. */}
                {onClose ? (
                  <IconButton
                    variant="subtle"
                    size="sm"
                    aria-label={t("hidePanel")}
                    onClick={onClose}
                    className="max-md:hidden"
                  >
                    <X />
                  </IconButton>
                ) : null}
              </div>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="p-3">
                <RouteList
                  routes={visible.slice((page - 1) * ROUTES_PAGE_SIZE, page * ROUTES_PAGE_SIZE)}
                  onSelect={onSelect}
                  onReset={onResetFilters}
                />
              </div>
            </ScrollArea>
            {visible.length > ROUTES_PAGE_SIZE ? (
              <div className="shrink-0 border-t border-border py-4">
                <PaginationControl
                  page={page}
                  pageSize={ROUTES_PAGE_SIZE}
                  total={visible.length}
                  onPageChange={(next) => setPaging({ key: listKey, page: next })}
                  summary={false}
                  className="justify-center md:justify-center"
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

export interface RouteFiltersCardProps {
  routes: MapRoute[];
  filters: RouteFilters;
  onChange: (next: Partial<RouteFilters>) => void;
  onReset: () => void;
  /** Puts the card away: the X in its header. */
  onClose?: () => void;
  /** Where the card fills a phone's screen, the button at the foot that goes back to the map. */
  onDone?: () => void;
  resultCount?: number;
  className?: string;
}

/** The filters as a card of their own, shaped like the yachts map's filter panel. */
export function RouteFiltersCard({
  routes,
  filters,
  onChange,
  onReset,
  onClose,
  onDone,
  resultCount,
  className,
}: RouteFiltersCardProps) {
  const t = useTranslations("RoutesMap");
  const active = [filters.q.trim(), filters.country, filters.length, filters.level].filter(
    Boolean,
  ).length;

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-3 border-b border-border p-4">
        <h2 className="flex-1 text-xl leading-[1.3] font-bold text-natural-700">
          {t("filtersTitle", { count: active })}
        </h2>
        <button
          type="button"
          onClick={onReset}
          className="cursor-pointer rounded-lg px-1 py-1.5 leading-[1.4] font-bold underline underline-offset-2 outline-none hover:text-natural-500 focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {t("clearAll")}
        </button>
        {onClose ? (
          <IconButton variant="subtle" size="sm" aria-label={t("closeFilters")} onClick={onClose}>
            <X />
          </IconButton>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <RouteFiltersForm routes={routes} filters={filters} onChange={onChange} labelled />
      </div>
      {onDone ? (
        <div className="shrink-0 border-t border-border p-4">
          <Button variant="brand" className="w-full" onClick={onDone}>
            {t("showRoutes", { count: resultCount ?? routes.length })}
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
