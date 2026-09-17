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

import { useDeleteRoute } from "../hooks/use-routes";
import type { RouteRow } from "../types";

/*
 * A route's Delete takes its stops with it (the foreign key cascades), so one stray click would
 * throw away an itinerary somebody placed stop by stop. Unpublishing is the reversible way to
 * take a route off the site, which is why the confirmation names it.
 */
interface RouteDeleteDialogProps {
  route: RouteRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RouteDeleteDialog({ route, open, onOpenChange }: RouteDeleteDialogProps) {
  const t = useTranslations("Admin.Routes");
  const deleteRoute = useDeleteRoute();

  const confirm = () => {
    if (!route) return;

    deleteRoute.mutate(
      { id: route.id },
      {
        onSuccess: () => {
          toast.success(t("deleted", { title: route.title }));
          onOpenChange(false);
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose className="items-stretch">
        <DialogHeader>
          <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("deleteDialog.description", {
              title: route?.title ?? "",
              stops: route?.stops.length ?? 0,
            })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("deleteDialog.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={!route || deleteRoute.isPending}
            onClick={confirm}
          >
            {deleteRoute.isPending ? t("deleteDialog.deleting") : t("deleteDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
