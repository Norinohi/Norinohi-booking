"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@yacht-charter/ui/components/data-display/table";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { MultiSelect } from "@yacht-charter/ui/components/form/multi-select";
import { Select } from "@yacht-charter/ui/components/form/select";
import { ArrowDown, ArrowUp, TriangleAlert, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { usePopularFacets, useSetPopularFacets } from "../hooks/use-popular-facets";
import {
  POPULAR_FACET_KINDS,
  POPULAR_FACET_SURFACES,
  popularFacetSurfaceIsOrdered,
  type PopularFacetKind,
  type PopularFacetSurface,
  type PopularFacetValue,
} from "../types";

/*
 * PopularFacetsTable — the curated order of one facet's values.
 *
 * Two controls decide what is being edited: the kind (countries, boat types, amenities…) and the
 * surface. The surface is the one an editor will get wrong if it is not spelled out, because
 * both lists are "popular countries" in ordinary speech and they are genuinely different lists —
 * one heads the search filters, the other leads the home page — so each carries a sentence
 * saying which.
 *
 * Below them, a picker over the live catalogue vocabulary, and the chosen values in the order
 * they will appear. Ticking, unticking and the arrows all do the same thing: state the whole
 * ordered list. There is no partial save, so no moment exists where two values claim one place.
 *
 * The third surface, the filter allowlist, is the same list with the order taken away: it says
 * which values the search panel offers at all, and an empty one offers every value there is.
 */

const SKELETON_ROWS = 5;
const ORDER_SKELETON_WIDTH = "w-8";
const SKELETON_WIDTHS = ["w-40", "w-20", "w-24"];

export default function PopularFacetsTable() {
  const t = useTranslations("Admin.Popular");
  const locale = useLocale();

  const [kind, setKind] = useState<PopularFacetKind>("country");
  const [surface, setSurface] = useState<PopularFacetSurface>("popular");
  /* The order being edited, which is the saved order until an arrow or a tick moves it. */
  const [order, setOrder] = useState<string[] | null>(null);

  const { data, isPending, isError } = usePopularFacets({ kind, surface, locale });
  const save = useSetPopularFacets();
  /* The allowlist surface is a set, not an order. See `popularFacetSurfaceIsOrdered`. */
  const ordered = popularFacetSurfaceIsOrdered(surface);
  const columnCount = ordered ? 4 : 3;
  const skeletonWidths = ordered ? [ORDER_SKELETON_WIDTH, ...SKELETON_WIDTHS] : SKELETON_WIDTHS;

  /* A different kind or surface is a different list, so the local copy is dropped and the
     server's answer takes over again. */
  useEffect(() => {
    setOrder(null);
  }, [kind, surface]);

  const savedOrder = data?.selected.map((option) => option.value) ?? [];
  const values = order ?? savedOrder;
  const byValue = new Map((data?.available ?? []).map((option) => [option.value, option]));

  /*
   * Saves the whole ordered list and keeps the local copy as what the screen shows.
   *
   * The local copy is deliberately *not* dropped when the save succeeds. Doing that fell back
   * to the query's list, which has not refetched yet, so ticking three values quickly saved
   * only the last: each tick rebuilt its list from a copy that still predated the tick before
   * it. Keeping it means the next tick builds on what was actually just saved, and the query's
   * answer takes over again only when the kind or surface changes.
   */
  const commit = (next: string[]) => {
    setOrder(next);
    save.mutate(
      { kind, surface, values: next },
      {
        onSuccess: (result) => {
          /* A save reaches the database before it reaches the web app's cache, and only the
             second half can fail. Saying so beats a bare success on a page that has not moved. */
          toast[result.cache.ok || !result.cache.attempted ? "success" : "warning"](
            result.cache.ok || !result.cache.attempted ? t("saved") : t("cacheWarning"),
          );
        },
        /* The server kept whatever it had, so the local copy is now a lie; drop it and show
           what the refetch brings back. */
        onError: () => {
          setOrder(null);
          toast.error(t("error"));
        },
      },
    );
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= values.length) return;

    const next = [...values];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(target, 0, moved);
    commit(next);
  };

  const messageRow = (message: string) => (
    <TableRow>
      <TableCell colSpan={columnCount} className="py-8 text-center text-sm text-natural-500">
        {message}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.kind")}
            value={kind}
            onValueChange={(next) => {
              /* The Select only ever emits one of the values it was given, but it is typed as a
                 plain string; finding the match keeps the narrowing honest and drops a value
                 that somehow is not one of ours rather than pretending it is. */
              const picked = POPULAR_FACET_KINDS.find((option) => option === next);
              if (picked) setKind(picked);
            }}
            options={POPULAR_FACET_KINDS.map((option) => ({
              value: option,
              label: t(`kinds.${option}`),
            }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.surface")}
            value={surface}
            onValueChange={(next) => {
              const picked = POPULAR_FACET_SURFACES.find((option) => option === next);
              if (picked) setSurface(picked);
            }}
            options={POPULAR_FACET_SURFACES.map((option) => ({
              value: option,
              label: t(`surfaces.${option}`),
            }))}
          />
          <p className="text-sm text-natural-500">{t(`surfaceHint.${surface}`)}</p>
        </div>
      </div>

      <MultiSelect
        className="min-w-0"
        options={(data?.available ?? []).map((option) => ({
          value: option.value,
          label: labelWithCount(option, t("noListings")),
        }))}
        value={values}
        /* A newly ticked value goes on the end rather than into the picker's own order: the
           arrows are what decides position, and a tick that reshuffled the list would undo
           somebody's ordering as a side effect of adding one country. */
        onValueChange={(next) => commit(appendNew(values, next))}
        placeholder={t("filters.search")}
        searchPlaceholder={t("filters.search")}
        disabled={isPending || isError}
      />

      <Table>
        <TableHeader>
          <TableRow>
            {ordered ? <TableHead className="w-32">{t("table.order")}</TableHead> : null}
            <TableHead>{t("table.value")}</TableHead>
            <TableHead className="w-28">{t("table.count")}</TableHead>
            <TableHead className="w-24">{t("table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending
            ? Array.from({ length: SKELETON_ROWS }, (_, row) => (
                <TableRow key={row}>
                  {skeletonWidths.map((width) => (
                    <TableCell key={width}>
                      <Skeleton className={`h-4 rounded-md ${width}`} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : isError
              ? messageRow(t("error"))
              : values.length === 0
                ? messageRow(t(ordered ? "empty" : "emptyFilter"))
                : values.map((value, index) => {
                    const option = byValue.get(value);
                    return (
                      <TableRow key={value}>
                        {ordered ? (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span className="w-6 text-sm text-natural-500">{index + 1}</span>
                              <Button
                                variant="subtle"
                                size="sm"
                                aria-label={t("actions.moveUp")}
                                title={t("actions.moveUp")}
                                disabled={index === 0 || save.isPending}
                                onClick={() => move(index, -1)}
                              >
                                <ArrowUp className="size-4" />
                              </Button>
                              <Button
                                variant="subtle"
                                size="sm"
                                aria-label={t("actions.moveDown")}
                                title={t("actions.moveDown")}
                                disabled={index === values.length - 1 || save.isPending}
                                onClick={() => move(index, 1)}
                              >
                                <ArrowDown className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <span className="font-medium text-foreground">
                            {option?.label ?? value}
                          </span>
                        </TableCell>
                        <TableCell>
                          {option?.count === null || option?.count === undefined ? (
                            <span
                              className="flex items-center gap-1.5 text-sm text-natural-500"
                              title={t("noListings")}
                            >
                              <TriangleAlert className="size-4 shrink-0" />
                              {t("noListings")}
                            </span>
                          ) : (
                            <span className="text-sm text-natural-500">{option.count}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="subtle"
                            size="sm"
                            aria-label={t("actions.remove")}
                            title={t("actions.remove")}
                            disabled={save.isPending}
                            onClick={() => commit(values.filter((item) => item !== value))}
                          >
                            <X className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
        </TableBody>
      </Table>
    </div>
  );
}

/* A value the catalogue no longer carries is flagged in the picker too, not only in the table:
   the picker is where somebody would otherwise pin one without noticing. */
function labelWithCount(option: PopularFacetValue, noListings: string): string {
  return option.count === null
    ? `${option.label} (${noListings})`
    : `${option.label} (${option.count})`;
}

/**
 * The previous order, minus what was unticked, plus what was newly ticked, in that order.
 *
 * `next` arrives in the picker's own order, which is alphabetical. Adopting it wholesale would
 * silently re-alphabetise a list somebody had just arranged with the arrows.
 */
function appendNew(current: string[], next: string[]): string[] {
  const chosen = new Set(next);
  const kept = current.filter((value) => chosen.has(value));
  const known = new Set(kept);
  return [...kept, ...next.filter((value) => !known.has(value))];
}
