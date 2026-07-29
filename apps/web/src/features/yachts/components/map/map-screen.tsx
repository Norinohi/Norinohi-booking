"use client";

import { buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

import { DEFAULT_FILTERS, FiltersPanel, type FiltersState } from "@/components/shared/filters";

import { SAMPLE_BOATS } from "../../lib/sample-boats";

import MapMarker from "./map-marker";

/*
 * Figma "Map Preview" (node 960:345971): a 56px bar holding a single back button,
 * then the map bleeding to every edge below it.
 */
const MapCanvas = dynamic(() => import("./map-canvas"), {
  ssr: false,
  loading: () => <div className="size-full bg-natural-50" />,
});

/*
 * One pin per marina, not per boat — several yachts share a berth, and stacking
 * identical pins on one coordinate would only hide each other. The search procedure
 * will return the marinas already grouped this way.
 */
const MARINAS = [...new Map(SAMPLE_BOATS.map((boat) => [boat.marina.id, boat.marina])).values()];

export default function MapScreen() {
  // Local for now. Moves to the URL alongside the search screen's own state, so that
  // "Show All List" and "Back To Search" stop dropping whatever was selected.
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="px-4 py-3 md:px-6 2xl:px-[70px]">
        <Link href="/yachts" className={buttonVariants({ variant: "subtle", size: "sm" })}>
          <ArrowLeft />
          Back To Search
        </Link>
      </div>

      <div className="relative min-h-0 flex-1">
        <MapCanvas>
          {MARINAS.map((marina) => (
            <MapMarker key={marina.id} coordinates={marina.coordinates} />
          ))}
        </MapCanvas>

        {/* The controls float over the canvas, so the layer itself must stay
            transparent to the pointer or the map would no longer pan. */}
        <div className="pointer-events-none absolute inset-0 flex items-start gap-5 p-4 md:p-6 2xl:px-[70px] 2xl:pt-6 2xl:pb-[70px]">
          <FiltersPanel
            scrollable
            value={filters}
            onApply={setFilters}
            className="pointer-events-auto hidden max-h-full w-83.5 shrink-0 lg:flex"
          />
        </div>
      </div>
    </div>
  );
}
