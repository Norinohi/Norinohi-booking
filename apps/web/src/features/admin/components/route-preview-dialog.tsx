"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@yacht-charter/ui/components/overlay/dialog";
import { useTranslations } from "next-intl";

import { SuggestedRouteView } from "@/features/yachts";

import type { RouteRow } from "../types";

/*
 * The route as a customer will see it, before anyone can.
 *
 * `SuggestedRouteView` is the listing page's own component — the same still, the same drawn line,
 * the same two columns of days — so this is a preview rather than an approximation of one. What
 * the dialog cannot show is the surrounding page, which is why an inactive route is still worth
 * opening on the site once it is published.
 */
export default function RoutePreviewDialog({
  route,
  open,
  onOpenChange,
}: {
  route: RouteRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin.Routes.previewDialog");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        className="max-h-[90dvh] w-[95vw] max-w-280 items-stretch overflow-y-auto"
      >
        <DialogHeader className="text-left">
          <DialogTitle className="text-left">{t("title")}</DialogTitle>
          <DialogDescription className="text-left">
            {route ? t("subtitle", { target: route.targetLabel }) : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Mounted only while open: the view pulls in a Mapbox still and, once opened, mapbox-gl. */}
        {open && route && route.stops.length > 0 ? (
          <div className="w-full text-left">
            <SuggestedRouteView
              title={route.title}
              description={route.description}
              stops={route.stops.map((stop, index) => ({
                /* The day number is the position in the itinerary, exactly as the public page
                   derives it — `sort_order` is storage, not something a reader ever sees. */
                day: index + 1,
                name: stop.name,
                note: stop.note,
                lat: stop.lat,
                lng: stop.lng,
              }))}
            />
          </div>
        ) : (
          <p className="w-full text-left text-base text-natural-500">{t("empty")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
