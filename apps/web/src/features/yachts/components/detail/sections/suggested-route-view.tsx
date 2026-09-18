"use client";

import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

import { Info, MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import DayTimeline, { type TimelineDay } from "@/components/shared/data-display/day-timeline";
import MapPreview from "@/components/shared/overlay/map-preview";
import { staticMapFrame, stillPositionStyle } from "@/lib/mapbox";

import {
  arrivalOf,
  ROUTE_DRAW_MS,
  type RouteStop,
  routeCaption,
  routeCurve,
  routePoints,
} from "@/components/shared/map/route-points";

/*
 * The itinerary itself — the still with the drawn line over it, and the two columns of days.
 *
 * Split out of `suggested-route-section` so the admin route editor can preview exactly what it
 * is about to publish. The section reads the listing detail query; this reads nothing, so a route
 * that exists only in a form can be rendered through the same code the public page runs.
 */

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
  const maskId = useId();
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
              {/*
               * Two passes, the marker's own colours: a white casing carrying the brand core, both
               * thin and dash-dotted so the stops carry the section and the line only joins them.
               *
               * The reveal runs on a mask rather than on the visible strokes: animating
               * `pathLength` is itself implemented as a dash offset, so a dashed stroke and a drawn
               * one cannot be the same element. The mask is a fat solid stroke of the same path,
               * and the dashes show wherever it has already been drawn.
               */}
              {path ? (
                <>
                  <defs>
                    <mask id={maskId} maskUnits="userSpaceOnUse">
                      <motion.path
                        d={path}
                        fill="none"
                        stroke="white"
                        strokeWidth={12}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        {...draw}
                        transition={{ duration: ROUTE_DRAW_MS / 1000, ease: "easeInOut" }}
                      />
                    </mask>
                  </defs>
                  <g mask={`url(#${maskId})`}>
                    {[
                      { stroke: "stroke-white/90", width: 3.5, dash: "9 4 1.5 4" },
                      { stroke: "stroke-brand", width: 1.5, dash: "9 4 1.5 4" },
                    ].map((line) => (
                      <path
                        key={line.stroke}
                        d={path}
                        fill="none"
                        strokeWidth={line.width}
                        strokeDasharray={line.dash}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={line.stroke}
                      />
                    ))}
                  </g>
                </>
              ) : null}
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
                style={stillPositionStyle(marker)}
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
                {/* oxlint-disable-next-line design-tokens/no-arbitrary-size */}
                <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-brand-foreground shadow-brand-glow md:text-xs">
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

/** One authored route, exactly as the listing page draws it. */
export type SuggestedRouteViewProps = {
  title: string;
  description: string | null;
  /** In day order. `day` is the number the page prints, not the row's `sort_order`. */
  stops: { day: number; name: string; note: string | null; lat: number; lng: number }[];
};

export default function SuggestedRouteView({ title, description, stops }: SuggestedRouteViewProps) {
  const t = useTranslations("YachtDetail.route");

  /* The only thing the web still writes is the "Day N - place" line; the place and the note are
     the author's own words and are rendered as written. */
  const routeStops: RouteStop[] = stops.map((stop) => ({
    day: stop.day,
    title: t("stopTitle", { day: stop.day, place: stop.name }),
    description: stop.note,
    lat: stop.lat,
    lng: stop.lng,
  }));
  const days: TimelineDay[] = routeStops.map((stop) => ({
    title: stop.title,
    text: stop.description,
  }));
  const mid = Math.ceil(days.length / 2);
  const columns = [days.slice(0, mid), days.slice(mid)];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xl text-foreground">{title}</p>
      {description ? <p className="text-base leading-5.5 text-natural-500">{description}</p> : null}

      <RouteStill route={{ title, stops: routeStops }} />

      {/*
       * Under the map rather than in the section's heading: the picture is what reads as a promise
       * of exact positions, and the points on it are towns and islands the author named, not
       * surveyed marinas. The first and last day are the yacht's own base -- see `routeForBase`.
       *
       * Carried on the same tinted row the amenities section uses for its footnote, because grey
       * small print under a map is exactly what a reader skips -- and this is the line that says
       * the map is indicative.
       */}
      <div className="flex items-start gap-2 rounded-xl bg-brand-50 px-4 py-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-brand" />
        <p className="min-w-0 flex-1 text-sm leading-[1.4] text-foreground">{t("disclaimer")}</p>
      </div>

      <DayTimeline columns={columns} />
    </div>
  );
}
