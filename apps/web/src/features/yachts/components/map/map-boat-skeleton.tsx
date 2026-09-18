"use client";

import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";

import type { Coordinates } from "@/components/shared/map/geometry";
import type { MapInstance } from "@/components/shared/map/map-canvas";
import MapPopup from "@/components/shared/map/map-popup";

export interface MapBoatSkeletonProps {
  coordinates: Coordinates;
  map: MapInstance | null;
}

/*
 * What a marina pin opens while its first page of boats loads. With nothing on screen for that
 * second, a click read as missed and got pressed again.
 */
/* Shaped like the card it stands in for, photo beside details from md and above them on a phone. */
export default function MapBoatSkeleton({ coordinates, map }: MapBoatSkeletonProps) {
  return (
    <MapPopup coordinates={coordinates} map={map}>
      <div
        aria-busy="true"
        className="flex w-72 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-card shadow-[4px_4px_15px_rgba(0,0,0,0.08)] md:w-150.25 md:flex-row"
      >
        <Skeleton className="aspect-4/3 w-full rounded-none md:aspect-auto md:h-72 md:w-1/2" />
        <div className="flex flex-1 flex-col gap-3 p-4 md:p-5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-7 w-5/6" />
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="mt-2 h-4 w-1/2" />
          <Skeleton className="h-8 w-2/5" />
          <Skeleton className="mt-auto h-11 w-full" />
        </div>
      </div>
    </MapPopup>
  );
}
