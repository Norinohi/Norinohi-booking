"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

const RouteMap = dynamic(() => import("../route-map"), {
  ssr: false,
  loading: () => <div className="size-full bg-natural-100" />,
});

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
            <RouteMap stops={route.stops} />
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
