"use client";

import { Button, buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowLeft, List, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentProps, Ref } from "react";

import {
  clearFilterKeys,
  type FilterChip,
  FiltersPanel,
  FiltersPopover,
  type FiltersState,
  useFilterChips,
} from "@/components/shared/form/filters";
import { Link } from "@/i18n/navigation";

import MapListPanel from "./map-list-panel";

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
      className={cn("pointer-events-auto size-12 shadow-brand-glow md:size-11", className)}
    >
      <X />
    </Button>
  );
}

export interface MapChromeProps {
  filters: FiltersState;
  defaults: FiltersState;
  onFiltersChange: (next: FiltersState) => void;
  /** What the list shows, which narrows to a marina while one is open. */
  listFilters: FiltersState;
  listOpen: boolean;
  onListOpenChange: (open: boolean) => void;
  /** A card is open over the map, and on a phone it covers this chrome. */
  popupOpen: boolean;
  catalogueHref: ComponentProps<typeof Link>["href"];
  catalogueLabel: string;
  /** The panels that can claim the map's left edge, measured for its padding. */
  filtersRef: Ref<HTMLFormElement>;
  listRef: Ref<HTMLElement>;
  /** The button row and chips along the top, measured so a fit frames results below them. */
  controlsRef: Ref<HTMLDivElement>;
}

/** Everything laid over the search map: the way back, filters, their chips, and the list. */
export default function MapChrome({
  filters,
  defaults,
  onFiltersChange,
  listFilters,
  listOpen,
  onListOpenChange,
  popupOpen,
  catalogueHref,
  catalogueLabel,
  filtersRef,
  listRef,
  controlsRef,
}: MapChromeProps) {
  const t = useTranslations("YachtsMap");
  const common = useTranslations("Common");
  const chips = useFilterChips(filters);

  function removeChip(chip: FilterChip) {
    onFiltersChange(clearFilterKeys(filters, chip.keys, defaults));
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col gap-3 px-3 pt-3 pb-8 md:gap-5 md:pt-6 md:px-13.5 2xl:flex-row 2xl:items-start 2xl:px-17.5 2xl:pb-17.5">
      <div
        ref={controlsRef}
        className={cn(
          "flex flex-wrap items-start gap-2 transition-opacity duration-200 md:flex-nowrap md:gap-5 2xl:contents",
          // Popup covers these on phones (< 768px): fade out and disable there, keep them from md up.
          popupOpen &&
            "pointer-events-none opacity-0 **:pointer-events-none md:pointer-events-auto md:opacity-100 md:**:pointer-events-auto",
        )}
      >
        <Link
          href={catalogueHref}
          aria-label={catalogueLabel}
          className={buttonVariants({
            variant: "neutral",
            size: "icon",
            className: "pointer-events-auto shrink-0 md:hidden",
          })}
        >
          <ArrowLeft />
        </Link>
        <FiltersPanel
          ref={filtersRef}
          scrollable
          value={filters}
          onApply={onFiltersChange}
          className="pointer-events-auto hidden max-h-full w-83.5 shrink-0 2xl:flex"
        />
        <FiltersPopover
          variant="primary"
          value={filters}
          onApply={onFiltersChange}
          className="pointer-events-auto w-auto 2xl:hidden"
        />

        <div
          className={cn(
            "ml-auto grid items-start gap-2 md:contents",
            listOpen ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-1",
          )}
        >
          <Button
            type="button"
            variant="neutral"
            onClick={() => onListOpenChange(!listOpen)}
            className={cn("pointer-events-auto w-auto shadow-brand-glow", listOpen && "2xl:hidden")}
          >
            <List className="md:hidden" />
            <span className="sr-only md:not-sr-only">{t("showAllList")}</span>
          </Button>
          {listOpen ? (
            <CloseListButton
              onClick={() => onListOpenChange(false)}
              label={t("closeList")}
              className="md:hidden"
            />
          ) : null}
        </div>

        {chips.length > 0 && (
          <div className="flex w-full items-start gap-2 overflow-x-auto pb-1 md:w-auto md:min-w-0 md:flex-1 md:flex-wrap md:justify-end 2xl:order-last 2xl:justify-start *:pointer-events-auto *:shrink-0">
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
            ref={listRef}
            filters={listFilters}
            defaults={defaults}
            className="pointer-events-auto max-h-full"
          />
          <CloseListButton
            onClick={() => onListOpenChange(false)}
            label={t("closeList")}
            className="hidden md:inline-flex"
          />
        </div>
      ) : null}
    </div>
  );
}
