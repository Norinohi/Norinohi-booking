"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@yacht-charter/ui/components/overlay/dialog";
import { ArrowDown, ArrowUp, MapPinned, Pencil, Plus, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  useCreateRouteStop,
  useDeleteRouteStop,
  useReorderRouteStops,
  useUpdateRouteStop,
} from "../hooks/use-routes";
import type { RouteRow, RouteStopRow } from "../types";
import PlaceSearch from "./place-search";
import RoutePreviewDialog from "./route-preview-dialog";

/*
 * The stop editor: the ordered list on the left, the map that produces the coordinates on the
 * right. Both halves exist because the section this feeds used to *derive* its stops — the
 * charter base plus a fixed lat/lng offset per day — so a marker labelled "Hvar" was the marina
 * moved 0.18 degrees south. Order and position are now both authored, and both are stored.
 */

/* mapbox-gl is ~1.8MB and this dialog is one row action deep; it loads when the editor opens. */
const RouteStopMap = dynamic(() => import("./route-stop-map"), {
  ssr: false,
  loading: () => <div className="size-full bg-natural-50" />,
});

type Working = {
  /** Null while adding; the stop's id while editing one. */
  id: string | null;
  name: string;
  note: string;
  point: { lat: number; lng: number } | null;
};

const BLANK: Working = { id: null, name: "", note: "", point: null };

/* Somewhere in the Adriatic, so a route whose base has no stored coordinates still opens on water
   rather than on the null island off Africa. The author drags from wherever it lands. */
const FALLBACK_CENTRE = { lat: 43.51, lng: 16.44 };

function toWorking(stop: RouteStopRow): Working {
  return {
    id: stop.id,
    name: stop.name,
    note: stop.note ?? "",
    point: { lat: stop.lat, lng: stop.lng },
  };
}

export default function RouteStopsDialog({
  route,
  open,
  onOpenChange,
}: {
  route: RouteRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin.Routes.stops");
  const [working, setWorking] = useState<Working>(BLANK);
  const [previewOpen, setPreviewOpen] = useState(false);

  const createStop = useCreateRouteStop();
  const updateStop = useUpdateRouteStop();
  const deleteStop = useDeleteRouteStop();
  const reorderStops = useReorderRouteStops();

  /* A different route in the same dialog must not inherit the last one's half-typed stop. */
  useEffect(() => {
    if (open) setWorking(BLANK);
  }, [open, route?.id]);

  if (!route) return null;

  const stops = route.stops;
  const pending =
    createStop.isPending || updateStop.isPending || deleteStop.isPending || reorderStops.isPending;

  /* Where the map opens: the pin, then the base the route targets, then the first stop. */
  const centre = working.point ?? route.targetPoint ?? stops[0] ?? FALLBACK_CENTRE;
  const others = stops.filter((stop) => stop.id !== working.id);

  const save = async () => {
    if (!working.point || working.name.trim().length === 0) return;
    const fields = {
      name: working.name.trim(),
      lat: working.point.lat,
      lng: working.point.lng,
      note: working.note.trim() || null,
    };

    try {
      if (working.id) {
        await updateStop.mutateAsync({ id: working.id, ...fields });
        toast.success(t("saved", { name: fields.name }));
      } else {
        await createStop.mutateAsync({ routeId: route.id, ...fields });
        toast.success(t("added", { name: fields.name }));
      }
      setWorking(BLANK);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("failed"));
    }
  };

  const remove = async (stop: RouteStopRow) => {
    try {
      await deleteStop.mutateAsync({ id: stop.id });
      if (working.id === stop.id) setWorking(BLANK);
      toast.success(t("removed", { name: stop.name }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("failed"));
    }
  };

  /* Reorder submits the whole list: `sort_order` is unique per route, so a partial order would
     leave the untouched rows sitting on positions the moved ones now want. */
  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= stops.length) return;

    const order = stops.map((stop) => stop.id);
    const [moved] = order.splice(index, 1);
    if (!moved) return;
    order.splice(target, 0, moved);

    try {
      await reorderStops.mutateAsync({ routeId: route.id, stopIds: order });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("failed"));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showClose
          className="h-[90dvh] w-[95vw] max-w-320 items-stretch gap-0 overflow-hidden p-0"
        >
          <div className="flex flex-col gap-2 border-b border-natural-50 p-5 text-left">
            <DialogHeader className="gap-1 text-left">
              <DialogTitle className="text-left">{route.title}</DialogTitle>
              <DialogDescription className="text-left">
                {t("subtitle", { target: route.targetLabel, nights: route.nights })}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-y-auto lg:grid-cols-[380px_minmax(0,1fr)] lg:overflow-hidden">
            <div className="flex min-h-0 flex-col gap-3 border-natural-50 p-5 lg:overflow-y-auto lg:border-r">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-bold text-foreground">
                  {t("listTitle", { count: stops.length })}
                </h2>
                <Button
                  variant="subtle"
                  size="sm"
                  disabled={pending}
                  onClick={() => setWorking(BLANK)}
                >
                  <Plus className="size-4" />
                  {t("add")}
                </Button>
              </div>

              {stops.length === 0 ? (
                /*
                 * A route with no stops is the normal state of one just created, not an error —
                 * and it is also exactly what keeps it off the site, since publishing is refused
                 * until there is something to draw. Said plainly rather than left as a blank list.
                 */
                <div className="flex flex-col gap-2 rounded-xl border border-dashed border-natural-200 bg-natural-50 p-5 text-left">
                  <MapPinned className="size-6 text-natural-400" />
                  <p className="text-base font-semibold text-foreground">{t("empty.title")}</p>
                  <p className="text-sm leading-[1.4] text-natural-500">{t("empty.body")}</p>
                </div>
              ) : (
                <ol className="flex flex-col gap-2">
                  {stops.map((stop, index) => (
                    <li
                      key={stop.id}
                      className={`flex flex-col gap-2 rounded-xl border p-3 ${
                        working.id === stop.id
                          ? "border-brand bg-brand-50/40"
                          : "border-natural-100 bg-card"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <Chip variant="neutral">{t("day", { day: index + 1 })}</Chip>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-base font-semibold text-foreground">
                            {stop.name}
                          </span>
                          <span className="text-xs text-natural-500">
                            {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
                          </span>
                        </div>
                      </div>
                      {stop.note ? (
                        <p className="text-sm leading-[1.4] text-natural-500">{stop.note}</p>
                      ) : null}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="subtle"
                          size="sm"
                          aria-label={t("moveUp")}
                          disabled={pending || index === 0}
                          onClick={() => void move(index, -1)}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          aria-label={t("moveDown")}
                          disabled={pending || index === stops.length - 1}
                          onClick={() => void move(index, 1)}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          disabled={pending}
                          onClick={() => setWorking(toWorking(stop))}
                        >
                          <Pencil className="size-4" />
                          {t("edit")}
                        </Button>
                        <Button
                          variant="subtle"
                          size="sm"
                          aria-label={t("remove")}
                          disabled={pending}
                          onClick={() => void remove(stop)}
                        >
                          <Trash2 className="size-4 text-error-500" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="flex min-h-0 flex-col gap-3 p-5 lg:overflow-y-auto">
              <h2 className="text-base font-bold text-foreground">
                {working.id ? t("form.editTitle") : t("form.addTitle")}
              </h2>

              <PlaceSearch
                proximity={route.targetPoint ?? stops[0] ?? null}
                onPick={(place) =>
                  setWorking((previous) => ({
                    ...previous,
                    /* The typed name wins if there is one: the client names stops the way a
                       sailor would ("Vis town"), not the way a gazetteer does. */
                    name: previous.name.trim() || place.name,
                    point: { lat: place.lat, lng: place.lng },
                  }))
                }
              />

              {/* `shrink-0` because this is a flex item in a scrolling column: without it the map is
                  squeezed to a couple of pixels by the fields under it, and mapbox sizes its
                  canvas to whatever box it is handed. */}
              <div className="h-72 w-full shrink-0 overflow-hidden rounded-2xl border border-natural-100 lg:h-96">
                <RouteStopMap
                  point={working.point}
                  otherStops={others}
                  centre={centre}
                  onMove={(point) => setWorking((previous) => ({ ...previous, point }))}
                />
              </div>

              <p className="text-sm leading-[1.4] text-natural-500">
                {working.point
                  ? t("form.placed", {
                      lat: working.point.lat.toFixed(5),
                      lng: working.point.lng.toFixed(5),
                    })
                  : t("form.unplaced")}
              </p>

              <TextField
                label={t("form.name")}
                fieldClassName="h-12"
                value={working.name}
                placeholder={t("form.namePlaceholder")}
                onChange={(event) =>
                  setWorking((previous) => ({ ...previous, name: event.target.value }))
                }
              />

              <TextField
                multiline
                label={t("form.note")}
                value={working.note}
                placeholder={t("form.notePlaceholder")}
                onChange={(event) =>
                  setWorking((previous) => ({ ...previous, note: event.target.value }))
                }
              />

              <div className="flex items-center gap-2">
                <Button
                  variant="brand"
                  disabled={pending || !working.point || working.name.trim().length === 0}
                  onClick={() => void save()}
                >
                  {working.id ? t("form.save") : t("form.append")}
                </Button>
                {working.id ? (
                  <Button variant="neutral" disabled={pending} onClick={() => setWorking(BLANK)}>
                    {t("form.cancelEdit")}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-natural-50 p-5">
            <Button
              variant="subtle"
              disabled={stops.length === 0}
              onClick={() => setPreviewOpen(true)}
            >
              {t("preview")}
            </Button>
            <Button variant="neutral" onClick={() => onOpenChange(false)}>
              {t("close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RoutePreviewDialog route={route} open={previewOpen} onOpenChange={setPreviewOpen} />
    </>
  );
}
