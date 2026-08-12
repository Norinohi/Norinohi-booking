"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Popup } from "react-map-gl/mapbox";

import type { Coordinates } from "@/components/shared/overlay/marina-popover";

import MapBoatCard, { type MapBoatCardProps } from "./map-boat-card";
import type { MapInstance } from "./map-canvas";

const RESET_MAPBOX_CHROME =
  "[&_.mapboxgl-popup-content]:bg-transparent [&_.mapboxgl-popup-content]:p-0 [&_.mapboxgl-popup-content]:shadow-none [&_.mapboxgl-popup-tip]:hidden";

const PIN_CLEARANCE = 46;
const RECENTRE_MS = 500;
// On a phone, leave just this gap under the popup so the pager clears the map attribution/edge.
const BOTTOM_SAFE = 32;
// Below this container width we treat the map as a phone and pin the popup to the bottom.
const MOBILE_MAX = 768;

type PopupBoat = Omit<MapBoatCardProps, "layout" | "className"> & { id: string };

export type MapBoatPopupProps = {
  coordinates: Coordinates;
  /** One card for a lone marker; several when a marina's boats share the spot — paged, not stacked. */
  boats: PopupBoat[];
  map: MapInstance | null;
};

export default function MapBoatPopup({ coordinates, boats, map }: MapBoatPopupProps) {
  const t = useTranslations("YachtsMap");
  const cardRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const active = Math.min(index, boats.length - 1);
  const many = boats.length > 1;

  useEffect(() => {
    if (!map) return;

    const frame = requestAnimationFrame(() => {
      const height = cardRef.current?.getBoundingClientRect().height ?? 0;
      const container = map.getContainer();
      const viewportH = container.clientHeight;

      // On a phone, pin the popup to the bottom so the pager clears the map's edge with only a small
      // gap; on wider screens there's room to centre it around the marker.
      const pinY =
        container.clientWidth < MOBILE_MAX
          ? viewportH - BOTTOM_SAFE - PIN_CLEARANCE - height
          : viewportH / 2 - PIN_CLEARANCE - height / 2;

      map.easeTo({
        center: [coordinates.lng, coordinates.lat],
        offset: [0, pinY - viewportH / 2],
        duration: RECENTRE_MS,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [map, coordinates.lng, coordinates.lat]);

  return (
    <Popup
      longitude={coordinates.lng}
      latitude={coordinates.lat}
      anchor="top"
      offset={PIN_CLEARANCE}
      closeButton={false}
      closeOnClick={false}
      maxWidth="none"
      className={RESET_MAPBOX_CHROME}
    >
      <div
        ref={cardRef}
        className="relative flex origin-top flex-col items-center gap-2 duration-200 animate-in fade-in-0 zoom-in-95"
      >
        <span
          aria-hidden
          className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rotate-45 bg-card"
        />
        <div className="relative w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl shadow-[4px_4px_15px_rgba(0,0,0,0.08)] md:w-150.25">
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${active * 100}%)` }}
          >
            {boats.map((item) => (
              <div key={item.id} className="w-full shrink-0">
                <MapBoatCard layout="popup" {...item} className="border-0 shadow-none" />
              </div>
            ))}
          </div>
        </div>

        {many ? (
          <div
            // Keep the tap on the pager, not on the map underneath, or MapCanvas dismisses the popup.
            onMouseDown={(event) => event.stopPropagation()}
            onTouchStart={(event) => event.stopPropagation()}
            className="flex items-center gap-1 rounded-full bg-card p-1 shadow-[4px_4px_15px_rgba(0,0,0,0.1)]"
          >
            <button
              type="button"
              aria-label={t("previousBoat")}
              disabled={active === 0}
              onClick={() => setIndex(active - 1)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors outline-none hover:bg-natural-50 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronLeft className="size-5" />
            </button>
            <span className="min-w-12 text-center text-sm font-semibold tabular-nums text-foreground">
              {active + 1} / {boats.length}
            </span>
            <button
              type="button"
              aria-label={t("nextBoat")}
              disabled={active === boats.length - 1}
              onClick={() => setIndex(active + 1)}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors outline-none hover:bg-natural-50 focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        ) : null}
      </div>
    </Popup>
  );
}
