"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@yacht-charter/ui/components/data-display/table";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { Select } from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { Eye, EyeOff, Globe, MapPin, Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import IconAction from "../../shared/components/icon-action";
import { useGeographyOptions, useRoutes, useSetRouteActive } from "../hooks/use-routes";
import { ROUTE_KINDS, type RouteRow } from "../types";
import FeaturedRoutesDialog from "./featured-routes-dialog";
import RouteDeleteDialog from "./route-delete-dialog";
import RouteDialog from "./route-dialog";
import RoutePreviewDialog from "./route-preview-dialog";
import RouteStopsDialog from "./route-stops-dialog";

/*
 * RoutesTable: the hand-authored itinerary library, drafts included.
 *
 * Columns follow the ListingsTable conventions (min-width so narrow screens scroll, 50px header
 * rows). The stop count carries a colour, because a route with none is the one thing on this
 * screen that cannot be published — and the reason a listing page shows no itinerary.
 */

/* Sentinel for "All …": a real value, since a falsy selection makes Select show its placeholder. */
const ALL = "all";

const STATUS_VALUES = ["live", "draft"] as const;

const COLUMN_COUNT = 7;
const SKELETON_ROWS = 5;
const SKELETON_WIDTHS = ["w-48", "w-32", "w-20", "w-8", "w-16", "w-14", "w-40"];

export default function RoutesTable() {
  const t = useTranslations("Admin.Routes");
  const tKinds = useTranslations("Admin.Routes.kinds");
  const [countryId, setCountryId] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState<RouteRow | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [stopsFor, setStopsFor] = useState<string | null>(null);
  const [previewFor, setPreviewFor] = useState<string | null>(null);
  const [featuredOpen, setFeaturedOpen] = useState(false);
  const [deleting, setDeleting] = useState<RouteRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const geography = useGeographyOptions();
  const setActive = useSetRouteActive();

  const { data, isPending, isError } = useRoutes({
    /* The ALL sentinel is in neither list, so it drops out as `undefined`. */
    countryId: countryId === ALL ? undefined : countryId,
    kind: ROUTE_KINDS.find((option) => option === kind),
    active: status === ALL ? undefined : status === "live",
    query: query.trim() || undefined,
    page,
  });

  /* Read back out of the current page so the two dialogs follow the row as it is refetched:
     adding a stop answers with a new route object, and a held copy would go stale immediately. */
  const stopsRoute = data?.items.find((route) => route.id === stopsFor) ?? null;
  const previewRoute = data?.items.find((route) => route.id === previewFor) ?? null;

  const openCreate = () => {
    setEditing(null);
    setEditOpen(true);
  };

  const openEdit = (route: RouteRow) => {
    setEditing(route);
    setEditOpen(true);
  };

  const togglePublished = (route: RouteRow) => {
    setActive.mutate(
      { id: route.id, active: !route.active },
      {
        onSuccess: (next) =>
          toast.success(
            next.active
              ? t("published", { title: next.title })
              : t("unpublished", { title: next.title }),
          ),
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  const remove = (route: RouteRow) => {
    setDeleting(route);
    setDeleteOpen(true);
  };

  const onFilterChange = (set: (next: string) => void) => (next: string) => {
    set(next);
    setPage(1);
  };

  const messageRow = (message: string) => (
    <TableRow>
      <TableCell
        colSpan={COLUMN_COUNT}
        className="text-center text-sm font-medium text-natural-500"
      >
        {message}
      </TableCell>
    </TableRow>
  );

  const busy = setActive.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 md:flex-row">
        <TextField
          containerClassName="min-w-0 md:flex-1"
          fieldClassName="h-12"
          value={query}
          startIcon={<Search />}
          placeholder={t("filters.search")}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
        <Button variant="subtle" className="h-12 shrink-0" onClick={() => setFeaturedOpen(true)}>
          <Star className="size-4" />
          {t("actions.featured")}
        </Button>
        <Button variant="brand" className="h-12 shrink-0" onClick={openCreate}>
          <Plus className="size-4" />
          {t("actions.create")}
        </Button>
      </div>
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="min-w-0 md:w-52">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.country")}
            value={countryId}
            onValueChange={onFilterChange(setCountryId)}
            options={[
              { value: ALL, label: t("filters.allCountries") },
              ...(geography.data?.countries ?? []).map((entry) => ({
                value: entry.id,
                label: entry.name,
              })),
            ]}
          />
        </div>
        <div className="min-w-0 md:w-52">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.kind")}
            value={kind}
            onValueChange={onFilterChange(setKind)}
            options={[
              { value: ALL, label: t("filters.allKinds") },
              ...ROUTE_KINDS.map((value) => ({ value, label: tKinds(value) })),
            ]}
          />
        </div>
        <div className="min-w-0 md:w-44">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.status")}
            value={status}
            onValueChange={onFilterChange(setStatus)}
            options={[
              { value: ALL, label: t("filters.allStatuses") },
              ...STATUS_VALUES.map((value) => ({ value, label: t(`status.${value}`) })),
            ]}
          />
        </div>
      </div>

      <Table className="min-w-200 [&_td]:px-3 [&_td]:py-3 [&_th]:h-12.5 [&_th]:px-3 [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.title")}</TableHead>
            <TableHead className="w-36">{t("table.target")}</TableHead>
            <TableHead>{t("table.kind")}</TableHead>
            <TableHead className="w-16">{t("table.nights")}</TableHead>
            <TableHead className="w-28">{t("table.stops")}</TableHead>
            <TableHead className="w-20">{t("table.status")}</TableHead>
            <TableHead className="w-44 text-right">{t("table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending
            ? Array.from({ length: SKELETON_ROWS }, (_, row) => (
                <TableRow key={row}>
                  {SKELETON_WIDTHS.map((width, column) => (
                    <TableCell key={column}>
                      <Skeleton className={`h-4 rounded-md ${width}`} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : isError
              ? messageRow(t("error"))
              : data.items.length === 0
                ? messageRow(t("empty"))
                : data.items.map((route) => (
                    <TableRow key={route.id}>
                      <TableCell>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium text-foreground">
                            {route.title}
                          </span>
                          {route.description ? (
                            <span className="max-w-52 truncate text-sm text-natural-500">
                              {route.description}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="block max-w-36 truncate" title={route.targetLabel}>
                          {route.targetLabel}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{tKinds(route.kind)}</TableCell>
                      <TableCell className="whitespace-nowrap">{route.nights}</TableCell>
                      <TableCell>
                        {/* An empty itinerary is the one state that blocks publishing, so it is
                            coloured rather than left as a bare zero. */}
                        <Chip
                          variant={route.stops.length === 0 ? "warning" : "neutral"}
                          className="whitespace-nowrap"
                        >
                          {t("stopCount", { count: route.stops.length })}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <Chip variant={route.active ? "success" : "neutral"}>
                          {t(route.active ? "status.live" : "status.draft")}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <IconAction
                            label={t("actions.stops")}
                            disabled={busy}
                            onClick={() => setStopsFor(route.id)}
                          >
                            <MapPin />
                          </IconAction>
                          <IconAction
                            label={t("actions.preview")}
                            disabled={busy || route.stops.length === 0}
                            onClick={() => setPreviewFor(route.id)}
                          >
                            <Eye />
                          </IconAction>
                          <IconAction
                            label={t("actions.edit")}
                            disabled={busy}
                            onClick={() => openEdit(route)}
                          >
                            <Pencil />
                          </IconAction>
                          <IconAction
                            label={t(route.active ? "actions.unpublish" : "actions.publish")}
                            /* Publishing an empty route is refused by the server; the button
                               says so by being unavailable rather than by failing. */
                            disabled={busy || (!route.active && route.stops.length === 0)}
                            onClick={() => togglePublished(route)}
                          >
                            {route.active ? <EyeOff /> : <Globe />}
                          </IconAction>
                          <IconAction
                            label={t("actions.delete")}
                            disabled={busy}
                            destructive
                            onClick={() => remove(route)}
                          >
                            <Trash2 />
                          </IconAction>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
        </TableBody>
      </Table>

      {data && data.pagination.totalPages > 1 ? (
        <div className="flex justify-center md:justify-start">
          <PaginationControl
            page={page}
            onPageChange={setPage}
            pageCount={data.pagination.totalPages}
            summary={false}
          />
        </div>
      ) : null}

      <RouteDialog
        route={editing}
        open={editOpen}
        onOpenChange={setEditOpen}
        imageUploadEnabled={data?.imageUploadEnabled ?? false}
      />
      <FeaturedRoutesDialog open={featuredOpen} onOpenChange={setFeaturedOpen} />
      <RouteDeleteDialog route={deleting} open={deleteOpen} onOpenChange={setDeleteOpen} />
      <RouteStopsDialog
        route={stopsRoute}
        open={stopsFor !== null}
        onOpenChange={(next) => setStopsFor(next ? stopsFor : null)}
      />
      <RoutePreviewDialog
        route={previewRoute}
        open={previewFor !== null}
        onOpenChange={(next) => setPreviewFor(next ? previewFor : null)}
      />
    </div>
  );
}
