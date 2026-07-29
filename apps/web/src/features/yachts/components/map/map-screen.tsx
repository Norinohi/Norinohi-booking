"use client";

import { buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";

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
      </div>
    </div>
  );
}
