"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Dialog, DialogContent, DialogTrigger } from "@yacht-charter/ui/components/overlay/dialog";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Filter } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { MapRoute } from "../api/queries";
import type { RouteFilters } from "../lib/route-filters";
import { RouteFiltersCard } from "./routes-panel";

export interface RouteFiltersDialogProps {
  routes: MapRoute[];
  /** How many routes the filters leave, for the button that closes the card. */
  visibleCount: number;
  filters: RouteFilters;
  onChange: (next: Partial<RouteFilters>) => void;
  onReset: () => void;
  className?: string;
}

/**
 * The filters behind a button, for every width that has no room to stand them beside the map: a
 * phone, and a tablet up to the point the card opens on its own.
 */
export default function RouteFiltersDialog({
  routes,
  visibleCount,
  filters,
  onChange,
  onReset,
  className,
}: RouteFiltersDialogProps) {
  const t = useTranslations("RoutesMap");
  const [open, setOpen] = useState(false);
  const active = [filters.q.trim(), filters.country, filters.length, filters.level].filter(
    Boolean,
  ).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="brand" className={cn("pointer-events-auto", className)} />}
      >
        <Filter />
        {t("filtersButton", { count: active })}
      </DialogTrigger>
      <DialogContent className="inset-4 top-4 left-4 h-auto w-auto max-w-none translate-x-0 translate-y-0 items-stretch gap-0 rounded-2xl p-0 md:inset-x-auto md:left-6 md:w-83.5">
        <RouteFiltersCard
          routes={routes}
          filters={filters}
          onChange={onChange}
          onReset={onReset}
          onClose={() => setOpen(false)}
          onDone={() => setOpen(false)}
          resultCount={visibleCount}
          className="min-h-0 flex-1 border-0 shadow-none"
        />
      </DialogContent>
    </Dialog>
  );
}
