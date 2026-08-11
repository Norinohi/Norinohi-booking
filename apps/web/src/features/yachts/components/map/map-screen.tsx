"use client";

import { Button, buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, X } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useEffect, useRef, useState } from "react";

import {
  clearFilterKeys,
  type FilterChip,
  FiltersPanel,
  FiltersPopover,
  type FiltersState,
  useFilterChips,
  useFilterRanges,
} from "@/components/shared/form/filters";

import { mapMarkersQueryOptions } from "../../api/queries";
import { useListingCards } from "../../hooks/use-listing-cards";
import { useSearchInput } from "../../hooks/use-search-input";
import MapBoatPopup from "./map-boat-popup";
import type { MapInstance } from "./map-canvas";
import MapListPanel from "./map-list-panel";
import MapMarker from "./map-marker";

const MapCanvas = dynamic(() => import("./map-canvas"), {
  ssr: false,
  loading: () => <div className="size-full bg-natural-50" />,
});

function CloseListButton({
  onClick,
  label,
  className,
}: {
  onClick: () => void;
  label: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="neutral"
      size="icon"
      aria-label={label}
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
  const focusListingId = useSearchParams().get("selected");
  const { defaults } = useFilterRanges();
  const [filters, setFilters] = useState<FiltersState>(() => defaults);
  const [listOpen, setListOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(focusListingId);
  const [map, setMap] = useState<MapInstance | null>(null);
  const hasFocused = useRef(false);

  const t = useTranslations("YachtsMap");
  const common = useTranslations("Common");
  const { toMapCard } = useListingCards();
  const chips = useFilterChips(filters);

  const input = useSearchInput(filters, defaults, { sort: "recommended", page: 1 });
  const { data } = useQuery(mapMarkersQueryOptions(input));
  const markers = data?.markers ?? [];

  const selected = selectedListingId
    ? markers.find((marker) => marker.listingId === selectedListingId)
    : undefined;

  // Deep link from a listing's "See on map": once the map and the target marker are both ready,
  // recenter on it once. A ref guards it so later marker taps by the user never yank the viewport.
  useEffect(() => {
    if (hasFocused.current || !map || !focusListingId) return;
    const target = markers.find((marker) => marker.listingId === focusListingId);
    if (!target) return;
    hasFocused.current = true;
    map.flyTo({ center: [target.lng, target.lat], zoom: 11 });
  }, [map, markers, focusListingId]);

  function removeChip(chip: FilterChip) {
    setFilters(clearFilterKeys(filters, chip.keys, defaults));
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="px-4 py-3 md:px-13.5 2xl:px-[70px]">
        <Link href="/yachts" className={buttonVariants({ variant: "subtle", size: "sm" })}>
          <ArrowLeft />
          {t("backToSearch")}
        </Link>
      </div>

      <div className="relative min-h-0 flex-1">
        <MapCanvas onReady={setMap} onBackgroundPress={() => setSelectedListingId(null)}>
          {markers.map((marker, index) => (
            <MapMarker
              key={marker.listingId}
              coordinates={{ lat: marker.lat, lng: marker.lng }}
              label={marker.title}
              selected={marker.listingId === selectedListingId}
              order={index}
              onSelect={() => setSelectedListingId(marker.listingId)}
            />
          ))}

          {selected ? (
            <MapBoatPopup
              key={selected.listingId}
              coordinates={{ lat: selected.lat, lng: selected.lng }}
              boat={toMapCard(selected.listing)}
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
                {t("showAllList")}
              </Button>
              {listOpen ? (
                <CloseListButton
                  onClick={() => setListOpen(false)}
                  label={t("closeList")}
                  className="md:hidden"
                />
              ) : null}
            </div>

            {chips.length > 0 && (
              <div className="flex flex-wrap items-start justify-end gap-2 md:min-w-0 md:flex-1 2xl:order-last 2xl:justify-start [&>*]:pointer-events-auto">
                {chips.map((chip) => (
                  <Chip
                    key={chip.id}
                    variant="outline"
                    onRemove={() => removeChip(chip)}
                    removeLabel={common("removeFilter", { label: chip.label })}
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
              <MapListPanel
                filters={filters}
                defaults={defaults}
                className="pointer-events-auto max-h-full"
              />
              <CloseListButton
                onClick={() => setListOpen(false)}
                label={t("closeList")}
                className="hidden md:inline-flex"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
