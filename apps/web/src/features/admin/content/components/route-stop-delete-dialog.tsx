"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@yacht-charter/ui/components/overlay/dialog";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useDeleteRouteStop } from "../hooks/use-routes";
import type { RouteStopRow } from "../types";

/*
 * A stop carries a pin placed by hand and a note in up to four languages, and the trash button
 * sits beside Move and Edit in a list that is easy to misclick. There is no restore for a stop,
 * so the same confirmation the route's own Delete asks for.
 */
interface RouteStopDeleteDialogProps {
  routeTitle: string;
  stop: RouteStopRow | null;
  /** The stop's day as the list numbers it, so the dialog names the row that was clicked. */
  day: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (stop: RouteStopRow) => void;
}

export default function RouteStopDeleteDialog({
  routeTitle,
  stop,
  day,
  open,
  onOpenChange,
  onDeleted,
}: RouteStopDeleteDialogProps) {
  const t = useTranslations("Admin.Routes.stops");
  const deleteStop = useDeleteRouteStop();

  const confirm = () => {
    if (!stop) return;

    deleteStop.mutate(
      { id: stop.id },
      {
        onSuccess: () => {
          onDeleted(stop);
          toast.success(t("removed", { name: stop.name }));
          onOpenChange(false);
        },
        onError: (error: Error) => toast.error(error.message || t("failed")),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose className="items-stretch">
        <DialogHeader>
          <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("deleteDialog.description", { name: stop?.name ?? "", day, title: routeTitle })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("deleteDialog.cancel")}
          </Button>
          <Button variant="destructive" disabled={!stop || deleteStop.isPending} onClick={confirm}>
            {deleteStop.isPending ? t("deleteDialog.deleting") : t("deleteDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
