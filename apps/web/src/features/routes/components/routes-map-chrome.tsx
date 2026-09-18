"use client";

import { Button, buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { Dialog, DialogContent, DialogTrigger } from "@yacht-charter/ui/components/overlay/dialog";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowLeft, Filter, List, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "@/i18n/navigation";

import type { MapRoute } from "../api/queries";
import type { RouteFilters } from "../lib/route-filters";
import { RouteFiltersCard } from "./routes-panel";

export interface RoutesMapChromeProps {
  routes: MapRoute[];
  /** How many routes the filters leave, for the button that closes them. */
  visibleCount: number;
  filters: RouteFilters;
  onFiltersChange: (next: Partial<RouteFilters>) => void;
  onResetFilters: () => void;
  listOpen: boolean;
  onListOpenChange: (open: boolean) => void;
  /** A marina's boats are open over the map, and on a phone this row would sit on them. */
  popupOpen: boolean;
}

/**
 * What a phone shows over the routes map, laid out as the yachts map's own: the way back, the
 * filters behind a button that opens them full screen and counts the ones set, and the list behind
 * another.
 */
export default function RoutesMapChrome({
  routes,
  visibleCount,
  filters,
  onFiltersChange,
  onResetFilters,
  listOpen,
  onListOpenChange,
  popupOpen,
}: RoutesMapChromeProps) {
  const t = useTranslations("RoutesMap");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const active = [filters.q.trim(), filters.country, filters.length, filters.level].filter(
    Boolean,
  ).length;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-3 top-3 flex transition-opacity duration-200 md:hidden",
        popupOpen && "opacity-0 **:pointer-events-none",
      )}
    >
      <div className="flex w-full items-start gap-2">
        <Link
          href="/"
          aria-label={t("back")}
          className={buttonVariants({
            variant: "neutral",
            size: "icon",
            className: "pointer-events-auto shrink-0",
          })}
        >
          <ArrowLeft />
        </Link>

        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogTrigger render={<Button variant="primary" className="pointer-events-auto" />}>
            <Filter />
            {t("filtersButton", { count: active })}
          </DialogTrigger>
          <DialogContent className="inset-4 top-4 left-4 h-auto w-auto max-w-none translate-x-0 translate-y-0 items-stretch gap-0 rounded-2xl p-0">
            <RouteFiltersCard
              routes={routes}
              filters={filters}
              onChange={onFiltersChange}
              onReset={onResetFilters}
              onClose={() => setFiltersOpen(false)}
              resultCount={visibleCount}
              className="min-h-0 flex-1 border-0 shadow-none"
            />
          </DialogContent>
        </Dialog>

        {/* The yachts map's own pair: the list button stays, and a close joins it once open. */}
        <Button
          type="button"
          variant="neutral"
          aria-expanded={listOpen}
          onClick={() => onListOpenChange(!listOpen)}
          className="pointer-events-auto ml-auto w-auto shrink-0 shadow-brand-glow"
        >
          <List />
          <span className="sr-only">{listOpen ? t("hideList") : t("showList")}</span>
        </Button>
        {listOpen ? (
          <Button
            type="button"
            variant="neutral"
            size="icon"
            aria-label={t("hideList")}
            onClick={() => onListOpenChange(false)}
            className="pointer-events-auto size-12 shrink-0 shadow-brand-glow"
          >
            <X />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
