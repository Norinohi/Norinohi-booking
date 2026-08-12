"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import { useInViewport } from "@/hooks/use-in-viewport";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

const RouteMap = dynamic(() => import("../route-map"), {
  ssr: false,
  loading: () => <div className="size-full bg-natural-100" />,
});

/*
 * Mounted only once the map scrolls near the viewport.
 *
 * `dynamic(..., { ssr: false })` alone was not enough: it skips server rendering, but the chunk
 * still downloads and initialises as soon as the component mounts — and this page renders all its
 * sections at once. Mapbox is ~1.8MB, and initialising it ran forced reflows that tied up the main
 * thread, which is what made navigating *away* from a listing slow (measured: 767ms to home,
 * 1493ms to search). Most visitors never scroll this far.
 */
function LazyRouteMap({
  stops,
}: {
  stops: { title: string; description: string; lat: number; lng: number }[];
}) {
  const { ref, entered } = useInViewport<HTMLDivElement>();

  return (
    <div ref={ref} className="size-full">
      {entered ? <RouteMap stops={stops} /> : <div className="size-full bg-natural-100" />}
    </div>
  );
}

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

        {route.stops.length ? (
          <div className="h-78 w-full overflow-hidden rounded-2xl md:h-108.75">
            <LazyRouteMap stops={route.stops} />
          </div>
        ) : null}

        <div className="flex flex-col gap-10 pt-3 md:flex-row md:items-start">
          {columns.map((column, index) => (
            <DayList key={index} days={column} />
          ))}
        </div>
      </div>
    </DetailSection>
  );
}
