"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import { MapPin } from "lucide-react";

import MapPreview from "@/components/shared/overlay/map-preview";
import { staticMapFrame } from "@/lib/mapbox";

import {
  type RouteStop,
  routeCaption,
  routePointRole,
  routePoints,
} from "../../../lib/route-points";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

/*
 * Mapbox is ~1.8MB, and initialising it ran forced reflows that tied up the main thread — which is
 * what made navigating *away* from a listing slow (measured: 767ms to home, 1493ms to search). It
 * used to be held back by `dynamic(ssr:false)` plus a viewport gate, so anyone who scrolled this
 * far still paid it. Behind a still that opens on demand, only a visitor who asks for the map does.
 */
const RouteMap = dynamic(() => import("../route-map"), {
  ssr: false,
  loading: () => <div className="size-full bg-natural-100" />,
});

/* The still is ordered at this size; the frame maths needs the same numbers to place the marks. */
const STILL = { width: 960, height: 480 };

type Stop = { title: string; text: string };

function DayList({ days }: { days: Stop[] }) {
  return (
    <ol className="relative flex min-w-0 flex-1 flex-col ">
      <span aria-hidden className="absolute inset-y-2 left-0.5 w-3 rounded-full bg-brand-50/50" />
      <span
        aria-hidden
        className="absolute inset-y-2 left-1.5 border-l-4 border-dotted border-brand-100"
      />

      {days.map((day, index) => (
        <li key={day.title} className="flex gap-4">
          <div className="flex w-4 shrink-0 justify-center">
            <span className="relative size-4 shrink-0 rounded-full border-2 border-brand bg-card" />
          </div>
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col gap-1.5",
              index < days.length - 1 && "pb-10.5",
            )}
          >
            <h3 className="text-xl leading-6.5 font-bold text-foreground">{day.title}</h3>
            <p className="text-base leading-5.5 text-foreground">{day.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/*
 * The still, marked with the app's own markers rather than the teardrops Mapbox draws.
 *
 * Same shape the live map used, so the section reads the same whether it is open or not. The
 * positions come from the frame the still was ordered in — see `staticMapFrame`.
 */
function RouteStill({ route }: { route: { title: string; stops: RouteStop[] } }) {
  const t = useTranslations("YachtDetail.route");
  const words = { start: t("start"), finish: t("finish") };
  const points = routePoints(route.stops);
  const frame = staticMapFrame(points, STILL);

  return (
    <MapPreview
      title={route.title}
      imageUrl={frame.url}
      imageSizes="(min-width: 768px) 960px, 100vw"
      className="h-78 w-full rounded-2xl md:h-108.75"
      overlay={frame.markers.map((marker, index) => {
        const point = points[index];
        if (!point) return null;

        const role = routePointRole(point, route.stops);
        const caption = role ? routeCaption(role, words) : undefined;

        return (
          <span
            key={`${point.lat},${point.lng}`}
            aria-hidden
            style={{ left: `${marker.leftPercent}%`, top: `${marker.topPercent}%` }}
            className="absolute flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/25 md:size-21"
          >
            <MapPin className="size-6 fill-brand text-white" />
            {caption ? (
              <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-brand-foreground shadow-[4px_4px_15px_rgba(47,128,237,0.15)] md:text-xs">
                {caption}
              </span>
            ) : null}
          </span>
        );
      })}
    >
      <RouteMap stops={route.stops} />
    </MapPreview>
  );
}

export default function SuggestedRouteSection() {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();

  if (!data) return null;

  const route = data.suggestedRoute;
  const stops: Stop[] = route.stops.map((stop) => ({ title: stop.title, text: stop.description }));
  const mid = Math.ceil(stops.length / 2);
  const columns = [stops.slice(0, mid), stops.slice(mid)];

  return (
    <DetailSection id="suggested-route" title={t("sections.suggestedRoute")}>
      <div className="flex flex-col gap-3">
        <p className="text-xl text-foreground">{route.title}</p>

        {route.stops.length ? <RouteStill route={route} /> : null}

        <div className="flex flex-col gap-10 pt-3 md:flex-row md:items-start">
          {columns.map((column, index) => (
            <DayList key={index} days={column} />
          ))}
        </div>
      </div>
    </DetailSection>
  );
}
