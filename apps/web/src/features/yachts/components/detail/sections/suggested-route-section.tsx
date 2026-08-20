"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import MapPreview from "@/components/shared/overlay/map-preview";
import { staticMapFrame } from "@/lib/mapbox";

import {
  arrivalOf,
  ROUTE_DRAW_MS,
  type RouteStop,
  routeCaption,
  routeCurve,
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
  const still = useReducedMotion();
  const words = {
    start: t("start"),
    finish: t("finish"),
    day: (day: number) => t("day", { day }),
  };
  const points = routePoints(route.stops);
  const frame = staticMapFrame(points, STILL);
  const curve = routeCurve(route.stops);

  /*
   * The overlay is measured rather than given a fixed viewBox, so its coordinates are its own
   * pixels. A percentage viewBox stretched to a non-square box scales the axes differently, and
   * `pathLength` normalisation is computed against the unstretched length — which turned the drawn
   * line into a dashed one. Matching the box removes the mismatch instead of compensating for it.
   */
  const svgRef = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    /* Measured here and not only in the observer: a `ResizeObserver` callback is delivered at the
       end of a frame, so a tab that is not painting would never draw the route at all. */
    const measure = () => {
      const { width, height } = svg.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      setBox((previous) =>
        previous?.width === width && previous.height === height ? previous : { width, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const path = box
    ? curve.points
        .map((point, index) => {
          const { leftPercent, topPercent } = frame.project(point);
          const x = ((leftPercent / 100) * box.width).toFixed(1);
          const y = ((topPercent / 100) * box.height).toFixed(1);
          return `${index === 0 ? "M" : "L"}${x},${y}`;
        })
        .join(" ")
    : "";

  const draw = still
    ? undefined
    : { initial: { pathLength: 0 }, whileInView: { pathLength: 1 }, viewport: { once: true } };

  return (
    <MapPreview
      title={route.title}
      imageUrl={frame.url}
      imageSizes="(min-width: 768px) 960px, 100vw"
      className="h-78 w-full rounded-2xl md:h-108.75"
      overlay={
        <>
          {curve.points.length > 1 ? (
            <svg
              ref={svgRef}
              aria-hidden
              viewBox={box ? `0 0 ${box.width} ${box.height}` : undefined}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full"
            >
              {/* Two passes, the marker's own colours: a white casing carrying the brand core. */}
              {path
                ? ["stroke-white/90", "stroke-brand"].map((stroke, index) => (
                    <motion.path
                      key={stroke}
                      d={path}
                      fill="none"
                      strokeWidth={index === 0 ? 4 : 2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={stroke}
                      {...draw}
                      transition={{ duration: ROUTE_DRAW_MS / 1000, ease: "easeInOut" }}
                    />
                  ))
                : null}
            </svg>
          ) : null}

          {frame.markers.map((marker, index) => {
            const point = points[index];
            if (!point) return null;

            const caption = routeCaption(point, route.stops, words);

            return (
              <motion.span
                key={`${point.lat},${point.lng}`}
                aria-hidden
                style={{ left: `${marker.leftPercent}%`, top: `${marker.topPercent}%` }}
                className="absolute flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-white/25 md:size-21"
                {...(still
                  ? {}
                  : {
                      initial: { opacity: 0, scale: 0.6 },
                      whileInView: { opacity: 1, scale: 1 },
                      viewport: { once: true },
                      /* Meets the line rather than racing it: the delay is the share of the
                         curve's length that runs before this stop. */
                      transition: {
                        duration: 0.35,
                        delay: (arrivalOf(curve, point) * ROUTE_DRAW_MS) / 1000,
                      },
                    })}
              >
                <MapPin className="size-6 fill-brand text-white" />
                <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-brand-foreground shadow-[4px_4px_15px_rgba(47,128,237,0.15)] md:text-xs">
                  {caption}
                </span>
              </motion.span>
            );
          })}
        </>
      }
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
