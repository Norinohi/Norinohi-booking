"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Select } from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@yacht-charter/ui/components/overlay/dialog";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { useCreateRoute, useUpdateRoute } from "../hooks/use-routes";
import { ROUTE_KINDS, type RouteKind, type RouteRow } from "../types";
import RouteTargetPicker, { type RouteTarget } from "./route-target-picker";

/*
 * The route's own fields. Stops are a separate screen — an itinerary is authored on a map, not in
 * a modal with the rest of the metadata.
 *
 * `active` is deliberately absent here. Publishing is a decision taken once the stops exist, so it
 * is a row action and an editor action; the server refuses to publish a route with none.
 */

type Draft = {
  target: RouteTarget;
  title: string;
  kind: RouteKind;
  nights: string;
  description: string;
  sortOrder: string;
};

const EMPTY: Draft = {
  target: { baseId: null, regionId: null },
  title: "",
  kind: "seven_days",
  nights: "7",
  description: "",
  sortOrder: "0",
};

function toDraft(route: RouteRow | null): Draft {
  if (!route) return EMPTY;
  return {
    target: { baseId: route.baseId, regionId: route.regionId },
    title: route.title,
    kind: route.kind,
    nights: String(route.nights),
    description: route.description ?? "",
    sortOrder: String(route.sortOrder),
  };
}

export default function RouteDialog({
  route,
  open,
  onOpenChange,
}: {
  /** Null opens the dialog in create mode. */
  route: RouteRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin.Routes.dialog");
  const tKinds = useTranslations("Admin.Routes.kinds");
  const titleId = useId();
  const nightsId = useId();
  const sortId = useId();
  const descriptionId = useId();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [targetError, setTargetError] = useState<string | null>(null);
  const createRoute = useCreateRoute();
  const updateRoute = useUpdateRoute();

  /* Reopening on a different row must not carry the previous route's fields over. */
  useEffect(() => {
    if (open) {
      setDraft(toDraft(route));
      setTargetError(null);
    }
  }, [open, route]);

  const nights = Number(draft.nights);
  const sortOrder = Number(draft.sortOrder);
  const validNights = Number.isInteger(nights) && nights >= 1 && nights <= 28;
  const validSort = Number.isInteger(sortOrder) && sortOrder >= 0;
  const hasTarget = Boolean(draft.target.baseId) !== Boolean(draft.target.regionId);
  const canSubmit = draft.title.trim().length > 0 && validNights && validSort && hasTarget;
  const pending = createRoute.isPending || updateRoute.isPending;

  const submit = async () => {
    if (!hasTarget) {
      setTargetError(t("errors.target"));
      return;
    }
    if (!canSubmit) return;

    const fields = {
      baseId: draft.target.baseId,
      regionId: draft.target.regionId,
      title: draft.title.trim(),
      kind: draft.kind,
      nights,
      description: draft.description.trim() || null,
      sortOrder,
    };

    try {
      if (route) {
        await updateRoute.mutateAsync({ id: route.id, ...fields });
        toast.success(t("updated", { title: fields.title }));
      } else {
        await createRoute.mutateAsync(fields);
        toast.success(t("created", { title: fields.title }));
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        className="max-h-[85dvh] w-[92vw] max-w-172 items-stretch overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{route ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex w-full flex-col gap-4 text-left">
          <RouteTargetPicker
            value={draft.target}
            currentLabel={route?.targetLabel}
            error={targetError ?? undefined}
            onChange={(target) => {
              setDraft((previous) => ({ ...previous, target }));
              setTargetError(null);
            }}
          />

          <TextField
            id={titleId}
            label={t("fields.title")}
            fieldClassName="h-12"
            value={draft.title}
            placeholder={t("fields.titlePlaceholder")}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, title: event.target.value }))
            }
          />

          <div className="flex flex-col gap-4 md:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-sm leading-4.25 font-semibold text-foreground">
                {t("fields.kind")}
              </span>
              <Select
                className="h-12 min-w-0"
                ariaLabel={t("fields.kind")}
                value={draft.kind}
                onValueChange={(next) =>
                  setDraft((previous) => ({
                    ...previous,
                    kind: ROUTE_KINDS.find((kind) => kind === next) ?? previous.kind,
                  }))
                }
                options={ROUTE_KINDS.map((kind) => ({ value: kind, label: tKinds(kind) }))}
              />
            </div>

            <TextField
              id={nightsId}
              type="number"
              min={1}
              max={28}
              containerClassName="min-w-0 md:w-40"
              fieldClassName="h-12"
              label={t("fields.nights")}
              status={validNights ? "default" : "error"}
              supportingText={validNights ? undefined : t("errors.nights")}
              value={draft.nights}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, nights: event.target.value }))
              }
            />

            <TextField
              id={sortId}
              type="number"
              min={0}
              containerClassName="min-w-0 md:w-40"
              fieldClassName="h-12"
              label={t("fields.sortOrder")}
              supportingText={t("fields.sortOrderHint")}
              value={draft.sortOrder}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, sortOrder: event.target.value }))
              }
            />
          </div>

          <TextField
            id={descriptionId}
            multiline
            label={t("fields.description")}
            value={draft.description}
            placeholder={t("fields.descriptionPlaceholder")}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, description: event.target.value }))
            }
          />
        </div>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button variant="brand" disabled={!canSubmit || pending} onClick={() => void submit()}>
            {route ? t("save") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
