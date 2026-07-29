"use client";

import { Button, buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { ArrowLeft, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

import {
  clearFilterKeys,
  DEFAULT_FILTERS,
  type FilterChip,
  FiltersPanel,
  type FiltersState,
  getFilterChips,
} from "@/components/shared/filters";

import { SAMPLE_BOATS } from "../../lib/sample-boats";

import MapListPanel from "./map-list-panel";
import MapMarker from "./map-marker";

/*
 * Figma "Map Preview" (node 960:345971): a 56px bar holding a single back button,
 * then the map bleeding to every edge below it.
 */
const MapCanvas = dynamic(() => import("./map-canvas"), {
  ssr: false,
  loading: () => <div className="size-full bg-natural-50" />,
});

const MARINAS = [...new Map(SAMPLE_BOATS.map((boat) => [boat.marina.id, boat.marina])).values()];

export default function MapScreen() {
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [listOpen, setListOpen] = useState(false);

  const chips = getFilterChips(filters);

  function removeChip(chip: FilterChip) {
    setFilters(clearFilterKeys(filters, chip.keys));
  }

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

        <div className="pointer-events-none absolute inset-0 flex items-start gap-5 p-4 md:p-6 2xl:px-[70px] 2xl:pt-6 2xl:pb-[70px]">
          <FiltersPanel
            scrollable
            value={filters}
            onApply={setFilters}
            className="pointer-events-auto hidden max-h-full w-83.5 shrink-0 lg:flex"
          />

          {listOpen ? (
            <>
              <MapListPanel className="pointer-events-auto max-h-full" />
              <Button
                type="button"
                variant="neutral"
                size="icon"
                aria-label="Close list"
                onClick={() => setListOpen(false)}
                className="pointer-events-auto size-11 shadow-[4px_4px_15px_rgba(47,128,237,0.15)]"
              >
                <X />
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="neutral"
              onClick={() => setListOpen(true)}
              className="pointer-events-auto shrink-0 capitalize shadow-[4px_4px_15px_rgba(47,128,237,0.15)]"
            >
              Show all list
            </Button>
          )}

          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-2 [&>*]:pointer-events-auto">
            {chips.map((chip) => (
              <Chip
                key={chip.id}
                variant="neutral"
                onRemove={() => removeChip(chip)}
                removeLabel={`Remove filter ${chip.label}`}
              >
                {chip.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
