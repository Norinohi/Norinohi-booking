"use client";

import { Button, buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowLeft, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

import {
  clearFilterKeys,
  DEFAULT_FILTERS,
  type FilterChip,
  FiltersPanel,
  FiltersPopover,
  type FiltersState,
  getFilterChips,
} from "@/components/shared/filters";

import { type SampleBoat, SAMPLE_BOATS } from "../../lib/sample-boats";

import MapBoatPopup from "./map-boat-popup";
import type { MapInstance } from "./map-canvas";
import MapListPanel from "./map-list-panel";
import MapMarker from "./map-marker";

const MapCanvas = dynamic(() => import("./map-canvas"), {
  ssr: false,
  loading: () => <div className="size-full bg-natural-50" />,
});

const BOAT_BY_MARINA = new Map<string, SampleBoat>();
for (const boat of SAMPLE_BOATS) {
  if (!BOAT_BY_MARINA.has(boat.marina.id)) BOAT_BY_MARINA.set(boat.marina.id, boat);
}

function CloseListButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button
      type="button"
      variant="neutral"
      size="icon"
      aria-label="Close list"
      onClick={onClick}
      className={cn(
        "pointer-events-auto size-12 shadow-[4px_4px_15px_rgba(47,128,237,0.15)] md:size-11",
        className,
      )}
    >
      <X />
    </Button>
  );
}

export default function MapScreen() {
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [listOpen, setListOpen] = useState(false);
  const [selectedMarina, setSelectedMarina] = useState<string | null>(null);
  const [map, setMap] = useState<MapInstance | null>(null);

  const chips = getFilterChips(filters);
  const selectedBoat = selectedMarina ? BOAT_BY_MARINA.get(selectedMarina) : undefined;

  function removeChip(chip: FilterChip) {
    setFilters(clearFilterKeys(filters, chip.keys));
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="px-4 py-3 md:px-13.5 2xl:px-[70px]">
        <Link href="/yachts" className={buttonVariants({ variant: "subtle", size: "sm" })}>
          <ArrowLeft />
          Back To Search
        </Link>
      </div>

      <div className="relative min-h-0 flex-1">
        <MapCanvas onReady={setMap} onBackgroundPress={() => setSelectedMarina(null)}>
          {[...BOAT_BY_MARINA.values()].map(({ marina }, index) => (
            <MapMarker
              key={marina.id}
              coordinates={marina.coordinates}
              label={marina.name}
              selected={marina.id === selectedMarina}
              order={index}
              onSelect={() => setSelectedMarina(marina.id)}
            />
          ))}

          {selectedBoat ? (
            <MapBoatPopup
              key={selectedMarina}
              coordinates={selectedBoat.marina.coordinates}
              boat={selectedBoat}
              map={map}
            />
          ) : null}
        </MapCanvas>

        <div className="pointer-events-none absolute inset-0 flex flex-col gap-4 px-4 pt-6 pb-8 md:gap-5 md:px-13.5 2xl:flex-row 2xl:items-start 2xl:px-[70px] 2xl:pb-[70px]">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-5 2xl:contents">
            <FiltersPanel
              scrollable
              value={filters}
              onApply={setFilters}
              className="pointer-events-auto hidden max-h-full w-83.5 shrink-0 2xl:flex"
            />
            <FiltersPopover
              variant="primary"
              value={filters}
              onApply={setFilters}
              className="pointer-events-auto 2xl:hidden"
            />

            <div
              className={cn(
                "grid items-start gap-4 md:contents",
                listOpen ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1",
              )}
            >
              <Button
                type="button"
                variant="neutral"
                onClick={() => setListOpen((open) => !open)}
                className={cn(
                  "pointer-events-auto w-full capitalize shadow-[4px_4px_15px_rgba(47,128,237,0.15)] md:w-auto",
                  listOpen && "2xl:hidden",
                )}
              >
                Show all list
              </Button>
              {listOpen ? (
                <CloseListButton onClick={() => setListOpen(false)} className="md:hidden" />
              ) : null}
            </div>

            {chips.length > 0 && (
              <div className="flex flex-wrap items-start justify-end gap-2 md:min-w-0 md:flex-1 2xl:order-last 2xl:justify-start [&>*]:pointer-events-auto">
                {chips.map((chip) => (
                  <Chip
                    key={chip.id}
                    variant="outline"
                    onRemove={() => removeChip(chip)}
                    removeLabel={`Remove filter ${chip.label}`}
                    className="bg-card"
                  >
                    {chip.label}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          {listOpen ? (
            <div className="flex min-h-0 flex-1 items-start gap-4 2xl:contents">
              <MapListPanel className="pointer-events-auto max-h-full" />
              <CloseListButton
                onClick={() => setListOpen(false)}
                className="hidden md:inline-flex"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
