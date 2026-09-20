"use client";

import { Button, buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowLeft, List, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

import type { MapRoute } from "../api/queries";
import type { RouteFilters } from "../lib/route-filters";
import RouteFiltersDialog from "./route-filters-dialog";

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

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-3 top-3 z-10 flex transition-opacity duration-200 md:hidden",
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

        <RouteFiltersDialog
          routes={routes}
          visibleCount={visibleCount}
          filters={filters}
          onChange={onFiltersChange}
          onReset={onResetFilters}
        />

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
