"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@yacht-charter/ui/components/overlay/dialog";
import { ArrowDown, ArrowUp, Plus, Search, Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useFeaturedRoutes, useReorderFeaturedRoutes, useRoutes } from "../hooks/use-routes";
import type { RouteRow } from "../types";

/*
 * Which routes the home page shows, and in what order.
 *
 * The page reads `charterSearch.popularRoutes({ limit: 12 })` and takes the first six for the
 * slider, so position is not decoration here: it decides whether a route is on the page at all.
 * The list says so per row rather than in a paragraph nobody reads.
 */

/** What the home page does with each position — see `sailing-routes.tsx`. */
const SLIDER_COUNT = 6;
const HOME_LIMIT = 12;

const SKELETON_ROWS = 4;

function placement(index: number) {
  if (index < SLIDER_COUNT) return "slider";
  if (index < HOME_LIMIT) return "grid";
  return "hidden";
}

interface FeaturedRoutesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FeaturedRoutesDialog({ open, onOpenChange }: FeaturedRoutesDialogProps) {
  const t = useTranslations("Admin.Routes.featured");
  const featured = useFeaturedRoutes();
  const reorder = useReorderFeaturedRoutes();

  const [order, setOrder] = useState<RouteRow[]>([]);
  const [query, setQuery] = useState("");

  /* The server's order is the draft's starting point every time the dialog opens, so a cancelled
     edit leaves nothing behind and a colleague's change is picked up rather than overwritten. */
  useEffect(() => {
    if (open && featured.data) setOrder(featured.data.routes);
  }, [open, featured.data]);

  /* Candidates come from the library itself: published routes, searchable, minus what is already
     chosen. A route with no stops cannot be published, so `active` alone keeps empties out. */
  const library = useRoutes({ active: true, query: query.trim() || undefined, page: 1 });
  const chosen = new Set(order.map((route) => route.id));
  const candidates = (library.data?.items ?? []).filter((route) => !chosen.has(route.id));

  const dirty =
    featured.data === undefined ||
    order.length !== featured.data.routes.length ||
    order.some((route, index) => route.id !== featured.data?.routes[index]?.id);

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    setOrder((previous) => {
      const next = [...previous];
      const [moved] = next.splice(index, 1);
      if (!moved) return previous;
      next.splice(target, 0, moved);
      return next;
    });
  };

  const save = async () => {
    try {
      await reorder.mutateAsync({ ids: order.map((route) => route.id) });
      toast.success(t("saved", { count: order.length }));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        className="h-[90dvh] w-[95vw] max-w-300 items-stretch gap-0 overflow-hidden p-0"
      >
        <div className="flex flex-col gap-2 border-b border-natural-50 p-5 text-left">
          <DialogHeader className="gap-1 text-left">
            <DialogTitle className="text-left">{t("title")}</DialogTitle>
            <DialogDescription className="text-left">{t("description")}</DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-y-auto lg:grid-cols-[minmax(0,1fr)_--spacing(95)] lg:overflow-hidden">
          <div className="flex flex-col gap-3 border-natural-50 p-5 lg:min-h-0 lg:overflow-y-auto lg:border-r">
            <h2 className="text-base font-bold text-foreground">
              {t("chosen", { count: order.length })}
            </h2>

            {featured.isPending ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : order.length === 0 ? (
              <div className="flex flex-col gap-2 rounded-xl border border-dashed border-natural-200 bg-natural-50 p-5 text-left">
                <Star className="size-6 text-natural-400" />
                <p className="text-base font-semibold text-foreground">{t("empty.title")}</p>
                <p className="text-sm leading-[1.4] text-natural-500">{t("empty.body")}</p>
              </div>
            ) : (
              <ol className="flex flex-col gap-2">
                {order.map((route, index) => {
                  const where = placement(index);
                  return (
                    <li
                      key={route.id}
                      className={`flex flex-col gap-2 rounded-xl border p-3 ${
                        where === "hidden"
                          ? "border-natural-100 bg-natural-50"
                          : "border-natural-100 bg-card"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <Chip variant={where === "hidden" ? "neutral" : "brand"}>{index + 1}</Chip>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-base font-semibold text-foreground">
                            {route.title}
                          </span>
                          <span className="truncate text-xs text-natural-500">
                            {route.targetLabel}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-natural-500">
                          {t(`placement.${where}`)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="subtle"
                          size="sm"
                          aria-label={t("moveUp")}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          aria-label={t("moveDown")}
                          disabled={index === order.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          onClick={() =>
                            setOrder((previous) =>
                              previous.filter((entry) => entry.id !== route.id),
                            )
                          }
                        >
                          <X className="size-4 text-error-500" />
                          {t("remove")}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="flex flex-col gap-3 p-5 lg:min-h-0 lg:overflow-y-auto">
            <h2 className="text-base font-bold text-foreground">{t("add")}</h2>

            <TextField
              fieldClassName="h-12"
              placeholder={t("search")}
              value={query}
              startIcon={<Search />}
              onChange={(event) => setQuery(event.target.value)}
            />

            {library.isPending ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: SKELETON_ROWS }, (_, index) => (
                  <Skeleton key={index} className="h-12 w-full rounded-xl" />
                ))}
              </div>
            ) : candidates.length === 0 ? (
              <p className="text-sm leading-[1.4] text-natural-500">{t("noCandidates")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {candidates.map((route) => (
                  <li
                    key={route.id}
                    className="flex items-center gap-2 rounded-xl border border-natural-100 bg-card p-3"
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {route.title}
                      </span>
                      <span className="truncate text-xs text-natural-500">{route.targetLabel}</span>
                    </div>
                    <Button
                      variant="subtle"
                      size="sm"
                      onClick={() => setOrder((previous) => [...previous, route])}
                    >
                      <Plus className="size-4" />
                      {t("addAction")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-natural-50 p-5">
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="brand"
            disabled={!dirty || reorder.isPending}
            onClick={() => void save()}
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
